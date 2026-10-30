"""Bounded structured model call. Disabled until explicitly configured locally."""

import asyncio
import json
import tomllib
from pathlib import Path
from typing import Annotated

import httpx2
from featherlane_contracts.judging import JudgeResponse
from pydantic import Field

from featherlane_api.modules.evaluation.judge_prompt import INSTRUCTIONS
from featherlane_api.modules.suites.criteria_config import (
    CriteriaGenerationConfig,
    read_criteria_key,
)


class JudgeConfig(CriteriaGenerationConfig):
    max_judged_trials: Annotated[int, Field(ge=1, le=100)] = 10
    max_packet_bytes: Annotated[int, Field(ge=1024, le=131072)] = 65536


def load_judge_config(path: Path) -> JudgeConfig | None:
    try:
        if path.stat().st_size > 16384:
            return None
        value = tomllib.loads(path.read_text())
        if set(value) != {"llm_judge"}:
            return None
        return JudgeConfig.model_validate(value["llm_judge"])
    except (OSError, ValueError):
        return None


class JudgeUnavailable(RuntimeError):
    """Permanent safe diagnostic (disabled, refused, invalid or unconfigured)."""


class JudgeTransient(RuntimeError):
    """Safe retryable transport diagnostic without provider text or evidence."""


class JudgeProvider:
    def __init__(self, path: Path = Path("config/llm-judge.toml")):
        self.path = path.resolve()
        self.config = load_judge_config(self.path)

    async def judge(self, packet: dict, frozen: dict) -> JudgeResponse:
        config = self.config
        if config is None or not config.enabled:
            raise JudgeUnavailable("LLM judge is disabled or unconfigured")
        if config.model_dump(exclude={"enabled", "api_key_file"}) != frozen:
            raise JudgeUnavailable("Judge configuration differs from sealed inputs")
        key = read_criteria_key(self.path.parent / config.api_key_file)
        if key is None:
            raise JudgeUnavailable("LLM judge credentials unavailable")
        schema = JudgeResponse.model_json_schema()
        payload = dict(
            model=config.model,
            instructions=INSTRUCTIONS,
            input=[
                dict(role="user", content=json.dumps(packet, separators=(",", ":")))
            ],
            reasoning=dict(effort=config.reasoning_effort),
            service_tier=config.service_tier,
            store=False,
            tools=[],
            max_output_tokens=config.max_output_tokens,
            text=dict(
                format=dict(
                    type="json_schema",
                    name="trial_judgment",
                    strict=True,
                    schema=schema,
                )
            ),
        )
        retry = False
        invalid = False
        response_body = None
        try:
            async with asyncio.timeout(config.timeout_seconds):
                async with httpx2.AsyncClient(
                    timeout=config.timeout_seconds,
                    trust_env=False,
                    follow_redirects=False,
                ) as client:
                    async with client.stream(
                        "POST",
                        "https://api.openai.com/v1/responses",
                        headers={"Authorization": "Bearer " + key},
                        json=payload,
                    ) as response:
                        if response.status_code in {408, 429, 500, 502, 503, 504}:
                            retry = True
                        elif response.status_code != 200:
                            invalid = True
                        else:
                            raw = bytearray()
                            async for chunk in response.aiter_bytes():
                                if len(raw) + len(chunk) > 65536:
                                    invalid = True
                                    break
                                raw.extend(chunk)
                            if not invalid:
                                response_body = json.loads(raw)
        except (TimeoutError, httpx2.HTTPError):
            retry = True
        except ValueError:
            invalid = True
        # Raise outside exception handlers: no sensitive chained transport errors.
        if retry:
            raise JudgeTransient("Transient judge transport failure")
        if invalid:
            raise JudgeUnavailable("Judge request failed")
        try:
            if (
                not isinstance(response_body, dict)
                or response_body.get("status") != "completed"
            ):
                raise ValueError("Incomplete output")
            texts = []
            for message in response_body.get("output", []):
                if message.get("type") != "message":
                    continue
                for part in message.get("content", []):
                    if part.get("type") != "output_text":
                        raise ValueError("Refused output")
                    texts.append(part["text"])
            if len(texts) != 1:
                raise ValueError("Expected one response")
            return JudgeResponse.model_validate_json(texts[0])
        except (ValueError, KeyError, TypeError, AttributeError):
            invalid = True
        if invalid:
            raise JudgeUnavailable("Judge returned unusable output")
