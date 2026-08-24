"""Institution short-code generation.

Format: three uppercase letters derived from the name followed by the
zero-padded primary key, e.g. id 16 + "Hospital" becomes HOS016.
Uniqueness comes from the sequential suffix, so name-derived collisions
are impossible by construction; the UNIQUE constraint on the column is
a seatbelt, not a requirement.

Letter derivation: the initial of each of the first three words. When
the name has fewer words than that, later letters are drawn from the
earlier words ("Hospital" -> HOS). Names without any ASCII alphanumerics
fall back to the QMS prefix.
"""

_CODE_LENGTH = 6
_PREFIX_LENGTH = _CODE_LENGTH - 3
_FALLBACK_PREFIX = "QMS"
_PAD_CHAR = "X"


def _clean_words(name: str) -> list[str]:
    words: list[str] = []
    for raw in name.split():
        cleaned = "".join(ch for ch in raw.upper() if ch.isascii() and ch.isalnum())
        if cleaned:
            words.append(cleaned)
    return words


def prefix_from_name(name: str) -> str:
    words = _clean_words(name)
    if not words:
        return _FALLBACK_PREFIX

    picked = [word[0] for word in words]
    if len(picked) >= _PREFIX_LENGTH:
        return "".join(picked[:_PREFIX_LENGTH])

    # Short name: keep pulling consecutive letters, rotating through the
    # words so every word contributes before any word is mined twice deep.
    offsets = [1] * len(words)
    while len(picked) < _PREFIX_LENGTH:
        progressed = False
        for index, word in enumerate(words):
            if offsets[index] < len(word):
                picked.append(word[offsets[index]])
                offsets[index] += 1
                progressed = True
                if len(picked) == _PREFIX_LENGTH:
                    break
        if not progressed:
            break
    return "".join(picked).ljust(_PREFIX_LENGTH, _PAD_CHAR)


def code_for(institution_id: int, name: str) -> str:
    return f"{prefix_from_name(name)}{institution_id:03d}"
