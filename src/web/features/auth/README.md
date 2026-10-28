# Sign-in and access presentation

`SignInPage` implements the approved P06 UI using the shared MUI theme. `AuthPageLayout` owns page structure; `AccessRequiredPanel` owns account/access feedback and actions. Mount the page within the existing ThemeProvider/CssBaseline and a viewport-height flex column, as demonstrated by `previews/P06/main.tsx`.

The required props distinguish signed-out/pending/error presentation from access-required/logout-error presentation. Access views require a display name and email; anonymous states cannot accidentally receive an invented default account. These are component props, not another session wire contract.

Callbacks notify the owning controller. The components do not fetch data, navigate to a guessed auth URL, write credentials, grant access or fabricate successful login/logout. Pending states expose labeled progress, and unavailable session retrieval has its own retry state. A failed access lookup must map to an error rather than claiming no membership. No project content is rendered here.

P06A supplies the real authentication endpoints and canonical identity/session contract on P05's reviewed backend foundation. P06.5 maps validated session data into these props and connects login, session refresh, CSRF-protected logout, routing and protected cache/stream cleanup. It starts only after P05 and P06 are verified merged and actual auth endpoints are ready; publication also requires merged backend dependencies. Real Google verification requires provider configuration. The normal web entry remains unchanged until that integration.

The isolated preview imports the actual components and supplies explicit sample identity and local presentation transitions. It contains all demo state controls; those controls are absent from production components. Run it with `previews/P06/README.md` instructions on port 4206.

## P06.5 authentication boundary

`SessionController` retrieves the canonical session using the generated query key,
validated SDK and status-specific response validators. It owns bootstrap, native
Google navigation from `browserNavigationPolicies`, expired/unavailable session
states, and the generated logout mutation. Repeated pending actions are guarded;
failed logout locks the workspace. A manual logout retry first retrieves the
current session/CSRF in case another tab rotated the cookie.

Each auth epoch has its own validated client and QueryClient. Identity or CSRF
rotation, logout and authentication loss cancel old reads, clear query/mutation
caches, and retire the old client. Requests use same-origin cookies, cloned
headers, in-memory CSRF, no-store and no JSON redirects. Retired clients reject
responses with AbortError. No browser credential or cache persistence is used.
There are currently no application event streams to close.

Public SDK wrappers finish with exported
`validateResult(schema, data, response, client)`. It validates the final generated
result and checks that supplied client's epoch after body reads, generated
validation and async transforms. P07's project wrappers must pass the same client
used to start their operation. Plain clients keep their existing validation
behavior without an epoch policy.

`AuthBoundary` owns QueryClientProvider and remounts its authenticated children on
epoch change. Children receive the canonical session, epoch-bound HTTP client,
auth epoch, `cacheScope` (`["auth", authEpoch, userId]`), `onSignOut()` and
`onSessionExpired()`; they obtain QueryClient through
context. Both callbacks guard their originating epoch. Session checks repeat on
focus/visible-page return. Use `onSessionExpired` for a current 401; P07 owns
403/404 access changes and organization/project-scoped query keys and invalidation.

The final normal-entry mount is **WAITING_DEPENDENCY** on P07's actual reviewed
discovery source. `main.tsx` is still the prior isolated demo entry; this partial
checkpoint is not a live authenticated application. SessionView alone cannot
select access-required or grant project access. No P07 paths/contracts or fake
empty memberships are supplied here.

The independently exercised development seam uses canonical
`http://127.0.0.1:4248`, API `127.0.0.1:8009`, and `/api` plus `/auth` proxies with
`changeOrigin: false`. Google callback registration must use
`http://127.0.0.1:4248/auth/google/callback`, returning to `/`. The manual proxy
and harness were temporary, not application configuration. Real Google and HTTPS
browser verification remain pending with the identity owner. An unconfigured
native Google navigation currently shows the API's canonical AUTH_UNAVAILABLE
JSON failure; it does not fabricate a successful login.
