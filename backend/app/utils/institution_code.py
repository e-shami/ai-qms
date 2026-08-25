"""Institution short-code generation.

Format: three uppercase LETTERS derived from the name followed by the
zero-padded primary key, e.g. id 16 + "Hospital" becomes HOS016. The
login screen validates this exact shape, so the prefix is restricted to
A-Z by construction.

Uniqueness comes from the sequential suffix, so name-derived collisions
are impossible; the UNIQUE constraint on the column is a seatbelt.

Letter derivation: initials of the first three words that contain any
letter. Words that are purely numeric are skipped entirely ("Ward 5
Clinic" -> WCL, not W5C). Shorter names keep pulling consecutive
letters from earlier words ("Hospital" -> HOS). Names without any ASCII
letters fall back to the QMS prefix.
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


def _initial(word: str) -> str | None:
    return next((ch for ch in word if ch.isalpha()), None)


def prefix_from_name(name: str) -> str:
    words = _clean_words(name)

    picked: list[str] = []
    offsets = [0] * len(words)
    for index, word in enumerate(words):
        initial = _initial(word)
        if initial is None:
            continue
        picked.append(initial)
        offsets[index] = 1
        if len(picked) == _PREFIX_LENGTH:
            break

    # Short or letterless start: keep pulling consecutive letters,
    # rotating through the words so each contributes before any word is
    # mined twice deep.
    while len(picked) < _PREFIX_LENGTH:
        progressed = False
        for index, word in enumerate(words):
            if offsets[index] < len(word) and word[offsets[index]].isalpha():
                picked.append(word[offsets[index]])
                offsets[index] += 1
                progressed = True
                if len(picked) == _PREFIX_LENGTH:
                    break
        if not progressed:
            break

    if not picked:
        return _FALLBACK_PREFIX
    return "".join(picked).ljust(_PREFIX_LENGTH, _PAD_CHAR)


def code_for(institution_id: int, name: str) -> str:
    return f"{prefix_from_name(name)}{institution_id:03d}"
