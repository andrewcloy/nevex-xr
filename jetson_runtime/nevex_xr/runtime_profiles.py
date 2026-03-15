from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any

PROFILE_SECTION_KEYS = ("camera", "output", "runtime", "features")
SUPPORTED_PROFILE_TYPES = {"validation", "operational", "custom"}


@dataclass(frozen=True)
class ActiveRuntimeProfile:
    name: str
    profile_type: str
    description: str | None
    extends: str | None
    is_default: bool
    inheritance_chain: tuple[str, ...]


@dataclass(frozen=True)
class ProfileResolutionResult:
    merged_payload: dict[str, Any]
    active_profile: ActiveRuntimeProfile
    available_profile_names: tuple[str, ...]
    default_profile_name: str | None


def resolve_profile_payload(
    payload: dict[str, Any],
    selected_profile_name: str | None = None,
) -> ProfileResolutionResult:
    raw_default_profile_name = payload.get("default_profile")
    if raw_default_profile_name is not None and not isinstance(
        raw_default_profile_name,
        str,
    ):
        raise ValueError("Config field 'default_profile' must be a string when provided.")

    raw_profiles = payload.get("profiles", {})
    if raw_profiles is None:
        raw_profiles = {}
    if not isinstance(raw_profiles, dict):
        raise ValueError("Config field 'profiles' must be an object when provided.")

    available_profile_names = tuple(sorted(raw_profiles.keys()))
    effective_profile_name = selected_profile_name or raw_default_profile_name

    merged_payload = deepcopy(payload)
    merged_payload.pop("profiles", None)
    merged_payload.pop("default_profile", None)

    if effective_profile_name is None:
        return ProfileResolutionResult(
            merged_payload=merged_payload,
            active_profile=ActiveRuntimeProfile(
                name="base",
                profile_type="custom",
                description="Base configuration without a named runtime profile.",
                extends=None,
                is_default=raw_default_profile_name is None,
                inheritance_chain=(),
            ),
            available_profile_names=available_profile_names,
            default_profile_name=raw_default_profile_name,
        )

    if effective_profile_name not in raw_profiles:
        available = ", ".join(available_profile_names) or "<none>"
        raise ValueError(
            "Requested runtime profile "
            f"'{effective_profile_name}' was not found. Available profiles: {available}",
        )

    resolved_profile = _resolve_named_profile(
        profiles=raw_profiles,
        profile_name=effective_profile_name,
        seen_stack=[],
    )
    for section_key in PROFILE_SECTION_KEYS:
        section_overrides = resolved_profile.get(section_key)
        if section_overrides is None:
            continue
        if not isinstance(section_overrides, dict):
            raise ValueError(
                f"Runtime profile '{effective_profile_name}' section '{section_key}' must be an object.",
            )
        base_section = merged_payload.get(section_key, {})
        if not isinstance(base_section, dict):
            raise ValueError(
                f"Base config section '{section_key}' must be an object before profile merging.",
            )
        merged_section = deepcopy(base_section)
        merged_section.update(deepcopy(section_overrides))
        merged_payload[section_key] = merged_section

    profile_type = resolved_profile.get("profile_type", "custom")
    if not isinstance(profile_type, str) or not profile_type.strip():
        raise ValueError(
            f"Runtime profile '{effective_profile_name}' field 'profile_type' must be a non-empty string.",
        )
    normalized_profile_type = profile_type.strip()
    if normalized_profile_type not in SUPPORTED_PROFILE_TYPES:
        supported_types = ", ".join(sorted(SUPPORTED_PROFILE_TYPES))
        raise ValueError(
            f"Runtime profile '{effective_profile_name}' has unsupported profile_type "
            f"'{normalized_profile_type}'. Expected one of: {supported_types}",
        )

    description_value = resolved_profile.get("description")
    if description_value is not None and not isinstance(description_value, str):
        raise ValueError(
            f"Runtime profile '{effective_profile_name}' field 'description' must be a string when provided.",
        )

    extends_value = resolved_profile.get("extends")
    if extends_value is not None and not isinstance(extends_value, str):
        raise ValueError(
            f"Runtime profile '{effective_profile_name}' field 'extends' must be a string when provided.",
        )

    return ProfileResolutionResult(
        merged_payload=merged_payload,
        active_profile=ActiveRuntimeProfile(
            name=effective_profile_name,
            profile_type=normalized_profile_type,
            description=description_value.strip() if isinstance(description_value, str) else None,
            extends=extends_value.strip() if isinstance(extends_value, str) else None,
            is_default=effective_profile_name == raw_default_profile_name,
            inheritance_chain=tuple(
                entry
                for entry in resolved_profile.get("_inheritance_chain", [])
                if isinstance(entry, str)
            ),
        ),
        available_profile_names=available_profile_names,
        default_profile_name=raw_default_profile_name,
    )


def _resolve_named_profile(
    profiles: dict[str, Any],
    profile_name: str,
    seen_stack: list[str],
) -> dict[str, Any]:
    if profile_name in seen_stack:
        cycle = " -> ".join([*seen_stack, profile_name])
        raise ValueError(f"Runtime profile inheritance cycle detected: {cycle}")

    raw_profile = profiles.get(profile_name)
    if not isinstance(raw_profile, dict):
        raise ValueError(f"Runtime profile '{profile_name}' must be an object.")

    extends_value = raw_profile.get("extends")
    base_profile: dict[str, Any] = {}
    inheritance_chain: list[str] = []
    if extends_value is not None:
        if not isinstance(extends_value, str) or not extends_value.strip():
            raise ValueError(
                f"Runtime profile '{profile_name}' field 'extends' must be a non-empty string when provided.",
            )
        normalized_parent_name = extends_value.strip()
        if normalized_parent_name not in profiles:
            available = ", ".join(sorted(profiles.keys()))
            raise ValueError(
                f"Runtime profile '{profile_name}' extends unknown profile "
                f"'{normalized_parent_name}'. Available profiles: {available}",
            )
        parent_profile = _resolve_named_profile(
            profiles=profiles,
            profile_name=normalized_parent_name,
            seen_stack=[*seen_stack, profile_name],
        )
        base_profile = deepcopy(parent_profile)
        inheritance_chain.extend(parent_profile.get("_inheritance_chain", []))
        inheritance_chain.append(normalized_parent_name)

    merged_profile = deepcopy(base_profile)
    for key, value in raw_profile.items():
        if key in PROFILE_SECTION_KEYS:
            if not isinstance(value, dict):
                raise ValueError(
                    f"Runtime profile '{profile_name}' section '{key}' must be an object.",
                )
            base_section = merged_profile.get(key, {})
            if base_section is None:
                base_section = {}
            if not isinstance(base_section, dict):
                raise ValueError(
                    f"Runtime profile '{profile_name}' inherited section '{key}' is not an object.",
                )
            merged_section = deepcopy(base_section)
            merged_section.update(deepcopy(value))
            merged_profile[key] = merged_section
            continue

        if key == "_inheritance_chain":
            continue
        merged_profile[key] = deepcopy(value)

    merged_profile["_inheritance_chain"] = inheritance_chain
    return merged_profile
