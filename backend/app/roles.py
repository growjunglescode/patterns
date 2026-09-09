ROLE_ALIASES = {
    "admin": {"admin"},
    "scientist": {"scientist", "researcher"},
    "citizen": {"citizen", "contributor"},
    "viewer": {"viewer"},
}


def canonical_role(role: str | None) -> str:
    if role in {"researcher", "scientist"}:
        return "scientist"
    if role in {"contributor", "citizen"}:
        return "citizen"
    if role == "admin":
        return "admin"
    if role == "viewer":
        return "viewer"
    return "citizen"


def expanded_roles(*roles: str) -> set[str]:
    allowed: set[str] = set()
    for role in roles:
        allowed |= ROLE_ALIASES.get(canonical_role(role), {role})
        allowed.add(role)
    return allowed
