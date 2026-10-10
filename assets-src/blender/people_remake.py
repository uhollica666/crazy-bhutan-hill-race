import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets-src/characters/quaternius-base.glb'))
for obj in list(bpy.context.scene.objects):
 if obj.type=='ARMATURE':
  bpy.context.view_layer.objects.active=obj
  for name,angle in [('upperarm_l',math.radians(72)),('upperarm_r',math.radians(-72))]:
   bone=obj.pose.bones.get(name)
   if bone:
    from mathutils import Matrix
    pivot=bone.head.copy()
    bone.matrix=Matrix.Translation(pivot) @ Matrix.Rotation(angle,4,'Y') @ Matrix.Translation(-pivot) @ bone.matrix
    bpy.context.view_layer.update()
positions=[];normals=[];regions=[]
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 bpy.context.view_layer.objects.active=obj
 for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 dec=obj.modifiers.new('Crowd topology','DECIMATE');dec.ratio=0.24
 bpy.ops.object.modifier_apply(modifier=dec.name)
 obj.data.calc_loop_triangles()
 for tri in obj.data.loop_triangles:
  for index in tri.vertices:
   v=obj.matrix_world @ obj.data.vertices[index].co
   n=(obj.matrix_world.to_3x3() @ obj.data.vertices[index].normal).normalized()
   positions.extend([round(-v.x,5),round(v.z,5),round(v.y,5)])
   normals.extend([round(-n.x,5),round(n.z,5),round(n.y,5)])
   # Garment/skin IDs are semantic, so crowd palettes can vary independently.
   region=0 if v.z>1.48 or (abs(v.x)>0.29 and v.z<1.06) else 1 if v.z>0.87 else 2 if v.z>0.13 else 3
   if v.z>1.68:region=4
   regions.append(region)
out=ROOT/'src/render/peopleBase.json'
out.write_text(json.dumps(dict(position=positions,normal=normals,region=regions),separators=(',',':')))
