"""GET /v1/library/find for the owner gateway (gateway_library.py calls serve()). Read-only: it opens the classified index in
the sidecar directory read-only and never writes, never touches owner-library/, never calls out to a network or a model service.

  GET /v1/library/find?q=<the user's whole request>&type=&subtype=&colour=&size=&min_quality=&game=&limit=&explain=1

q is the request in the user's own words; type, subtype, colour, size (a class: tiny|small|medium|large|huge) and min_quality are
optional hard filters (without them the request's own colour, size and type words steer the ranking). Answers at most 25 compact
candidates (default 12), each carrying gameId, path, kind and className, so import ops work unchanged, plus what an agent needs to
choose: description, tags, size, colours, quality, provenance, copies and why it matched. `no_strong_match` is true when nothing
covers the request's words well: an advisory that the agent may reject every candidate and build instead.

The index is found at $APPLE_OWNER_CLASSIFY (default ~/Library/Application Support/Apple/owner-classify); it is reloaded when
find.sqlite changes. If dense.f16.npy sits beside it, meaning-based retrieval joins in through a resident helper process (embed.py);
set APPLE_OWNER_DENSE=0 to run without it.
"""
import os
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import search  # noqa: E402

_lock = threading.RLock()
_state = {'sig': None, 'finder': None, 'dense': None}
TYPES = ('model', 'map', 'system', 'ui-kit', 'ui-screen', 'tool', 'animation', 'vfx', 'sfx', 'music', 'script', 'media-pack')
SIZES = ('tiny', 'small', 'medium', 'large', 'huge')


def directory():
    return os.environ.get('APPLE_OWNER_CLASSIFY') or search.DEFAULT_DIR


def finder():
    d = directory()
    path = os.path.join(d, 'find.sqlite')
    try:
        st = os.stat(path)
    except OSError:
        raise LookupError('no classified owner-library index yet (run packages/owner-classify/classify.py then index.py)')
    sig = (path, st.st_mtime_ns, st.st_size)
    with _lock:
        if _state['sig'] != sig:
            dense = None
            if os.environ.get('APPLE_OWNER_DENSE') != '0':
                try:
                    import embed
                    if _state['dense'] is not None:
                        _state['dense'].close()
                    dense = embed.client(d)
                except Exception:
                    dense = None
            _state['dense'] = dense
            _state['finder'] = search.Finder(d, dense=dense)
            _state['sig'] = sig
        return _state['finder']


def serve(value, number):
    q = value('q').strip()
    if not q:
        raise ValueError('q (the request, up to 200 characters) is required')
    if len(q) > 200:
        raise ValueError('q must be at most 200 characters')
    kind = value('type').lower()
    if kind and kind not in TYPES:
        raise LookupError('type must be one of ' + ', '.join(TYPES))
    size = value('size').lower()
    if size and size not in SIZES:
        raise LookupError('size must be one of ' + ', '.join(SIZES))
    colour = value('colour').lower()
    if len(colour) > 30:
        raise ValueError('colour too long')
    subtype = value('subtype').lower()
    if len(subtype) > 30 or len(value('game')) > 60:
        raise ValueError('subtype or game too long')
    minq = value('min_quality')
    f = finder()
    with _lock:  # one sqlite connection, shared
        return f.search(q, type=kind or None, subtype=subtype or None, colour=colour or None, size=size or None,
                        min_quality=number('min_quality', 0, 100) if minq else None, limit=number('limit', 12, 25),
                        explain=value('explain') == '1', game=value('game') or None)
