"""Access failures carry no resource metadata."""


class AccessNotFound(Exception):
    pass


class CreationConflict(Exception):
    pass
