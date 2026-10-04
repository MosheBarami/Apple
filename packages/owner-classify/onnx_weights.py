"""Reads the weights of an ONNX model with a hand-written protobuf reader (no onnx / onnxruntime package needed) and rebuilds
a Hugging Face BertModel from a dynamically-quantised MiniLM export, dequantising the int8 weights to float32.

Used for the optional dense tier (embed.py). The weights are read in place from wherever the caller points (by default the model
that ships inside the Continue VS Code extension on this machine); nothing is downloaded and nothing is copied into the repo.
"""
import struct

import numpy as np


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if not c & 0x80:
            return r, i
        s += 7


def fields(b):
    i, n = 0, len(b)
    while i < n:
        key, i = _varint(b, i)
        f, w = key >> 3, key & 7
        if w == 0:
            v, i = _varint(b, i)
        elif w == 2:
            ln, i = _varint(b, i)
            v = b[i:i + ln]
            i += ln
        elif w == 1:
            v = b[i:i + 8]
            i += 8
        elif w == 5:
            v = b[i:i + 4]
            i += 4
        else:
            raise ValueError('wire type %d' % w)
        yield f, w, v


DT = {1: np.float32, 2: np.uint8, 3: np.int8, 6: np.int32, 7: np.int64, 10: np.float16}


def tensor(b):
    dims, dtype, name, raw, floats, ints = [], 1, '', None, [], []
    for f, w, v in fields(b):
        if f == 1:
            dims.append(v) if w == 0 else dims.extend(_packed(v))
        elif f == 2:
            dtype = v
        elif f == 8:
            name = v.decode()
        elif f == 9:
            raw = v
        elif f == 4:
            floats.append(v) if w == 5 else floats.extend(struct.unpack('<%df' % (len(v) // 4), v))
        elif f in (5, 7):
            ints.extend(_packed(v)) if w == 2 else ints.append(v)
    npdt = DT[dtype]
    if raw is not None:
        arr = np.frombuffer(raw, dtype=npdt)
    elif floats:
        arr = np.array([struct.unpack('<f', x)[0] if isinstance(x, bytes) else x for x in floats], dtype=npdt)
    else:
        arr = np.array(ints, dtype=npdt)
    return name, arr.reshape(dims) if dims else arr.reshape(())


def _packed(v):
    out, i = [], 0
    while i < len(v):
        x, i = _varint(v, i)
        out.append(x)
    return out


def read_graph(path):
    b = open(path, 'rb').read()
    graph = next(v for f, w, v in fields(b) if f == 7)
    inits, nodes = {}, []
    for f, w, v in fields(graph):
        if f == 5:
            n, a = tensor(v)
            inits[n] = a
        elif f == 1:
            node = dict(inputs=[], outputs=[], op='', name='', attrs={})
            for ff, ww, vv in fields(v):
                if ff == 1:
                    node['inputs'].append(vv.decode())
                elif ff == 2:
                    node['outputs'].append(vv.decode())
                elif ff == 3:
                    node['name'] = vv.decode()
                elif ff == 4:
                    node['op'] = vv.decode()
            nodes.append(node)
    return inits, nodes


def dequantised_state(path):
    """name -> float32 array for every weight, with MatMulInteger weights dequantised (w - zero_point) * scale."""
    inits, nodes = read_graph(path)
    state = {}
    for n, a in inits.items():
        if a.dtype in (np.float32, np.float16):
            state[n] = a.astype(np.float32)
    for node in nodes:
        if node['op'] == 'MatMulInteger':
            wq = node['inputs'][1]
            zp = node['inputs'][3] if len(node['inputs']) > 3 else None
            state[wq] = dict(q=inits[wq], zp=inits[zp] if zp in inits else 0, node=node['name'])
    return inits, nodes, state
