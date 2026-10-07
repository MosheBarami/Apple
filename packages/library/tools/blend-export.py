# Run by blend-to-glb.mjs inside Blender (--background --factory-startup --disable-autoexec): opens each .blend of a
# list and exports its scene as one GLB with Blender's own glTF exporter. That exporter reads colour only from a
# Principled BSDF, so a material built the old way (a Diffuse BSDF node, or no nodes at all, as Blender 2.7x saved
# them) first gets a Principled BSDF carrying the same colour or the same texture link. Nothing else is changed,
# and nothing is painted or generated.
#   blender --background --factory-startup --disable-autoexec --python blend-export.py -- <list.json>
# <list.json> is [{"src": ".../X.blend", "out": ".../X.glb"}]; one line per file on stdout ("BLEND-EXPORT {...}").
import bpy, json, sys

OLD = ('BSDF_DIFFUSE', 'BSDF_GLOSSY', 'EMISSION', 'BSDF_TOON')


def principled(mat):
    if not mat.use_nodes or not mat.node_tree:
        colour = tuple(mat.diffuse_color)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        p = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p: p.inputs['Base Color'].default_value = colour
        return 'diffuse_color'
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    if any(n.type == 'BSDF_PRINCIPLED' for n in nodes): return None
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    src = next((n for n in nodes if n.type in OLD), None)
    if not out or not src or 'Color' not in src.inputs: return None
    p = nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = src.inputs['Color'].default_value
    for l in list(src.inputs['Color'].links): links.new(l.from_socket, p.inputs['Base Color'])
    links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return src.type


items = json.load(open(sys.argv[sys.argv.index('--') + 1]))
for it in items:
    try:
        bpy.ops.wm.open_mainfile(filepath=it['src'], load_ui=False, use_scripts=False)
        rebuilt = [m.name for m in bpy.data.materials if principled(m)]
        bpy.ops.export_scene.gltf(filepath=it['out'], export_format='GLB', export_apply=True, export_yup=True)
        print('BLEND-EXPORT ' + json.dumps({'src': it['src'], 'ok': True, 'blender': '.'.join(map(str, bpy.data.version)), 'rebuilt': rebuilt}), flush=True)
    except Exception as e:
        print('BLEND-EXPORT ' + json.dumps({'src': it['src'], 'ok': False, 'error': str(e)[:200]}), flush=True)
