"""Extraer las poses generadas, registrarlas y montar la prueba del sombrero.

No dibuja ni inventa poses: usa píxeles generados y las referencias originales.
Requiere Python 3 y Pillow. Ejecutar desde cualquier carpeta.
"""
from pathlib import Path
import importlib.util
import json
from statistics import median
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location('extraccion', HERE / 'herramientas/extraer_poses.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
W, H = 640, 724
SCALE, DX, DY = 1.04, 20, -19
FIXED_Y = 375
masks = json.loads((ROOT / 'gaucho-demo-conversacion/mascaras-azules.json').read_text())
texture = Image.open(ROOT / 'gaucho-prueba-cambio-mazo/frames/mazo_05.png').convert('RGBA')


def blue_original(image, kind, index):
    """Reutiliza máscaras y textura aprobadas del demo; no recolorea al personaje."""
    result = image.copy()
    for card in masks[kind][index]:
        spans = card['spans']
        x0, x1 = min(s[1] for s in spans), max(s[1] + s[2] for s in spans)
        y0, y1 = spans[0][0], spans[-1][0] + 1
        clip = Image.new('L', image.size)
        draw = ImageDraw.Draw(clip)
        for y, x, width in spans:
            draw.line((x, y, x + width - 1, y), fill=255)
        layer = Image.new('RGBA', image.size)
        layer.paste(texture.crop((355, 242, 360, 251)).resize((x1-x0, y1-y0), Image.Resampling.BICUBIC), (x0, y0))
        if card['motif']:
            x, y, r, b = card['motif']
            w, h = round((r-x)*1.3), round((b-y)*1.1)
            layer.paste(texture.crop((343, 257, 371, 292)).resize((w, h), Image.Resampling.BICUBIC), (round((x+r-w)/2), round((y+b-h)/2)))
        result = Image.composite(layer, result, clip)
    return result


look = [Image.open(ROOT / f'gaucho-prueba-respondiendo/frames/respondiendo_{i:02d}.png').convert('RGBA') for i in range(4)]
rest = Image.open(ROOT / 'gaucho-prueba-4frames/frames/atencion_00.png').convert('RGBA')
report = {'method': 'connected-components', 'shared_scale': SCALE, 'translation': [DX, DY], 'fixed_scene_from_y': FIXED_Y, 'variants': {}}
# Tiempos de la versión revisada e integrada en React; editables en el visor.
times = [120, 180, 180, 550, 350, 450, 600, 350, 1000]
labels = ['Atento original', 'Mirada seria', 'Asentimiento', 'Mirada de respuesta', 'Sube la mano', 'Toca el ala', 'Oculta los ojos', 'Vuelve la mano', 'Reposo original']
for variant, source_name in [('rojo', 'gesto-generado.png'), ('azul', 'gesto-generado-azul.png')]:
    source = Image.open(HERE / 'originales' / source_name).convert('RGBA')
    groups = extractor.component_frame_groups(source, 4)
    if groups is None or len(groups) != 4:
        raise RuntimeError(f'{variant}: no hay cuatro grupos completos')
    bounds = [extractor.component_bounds(group) for group in groups]
    # Registrar cada dibujo por su grupo visible, preservando el eje Y original.
    # Se aplica una única escala y un mismo desplazamiento a todos los cuadros.
    primeros = [blue_original(frame, 'respondiendo', i) for i, frame in enumerate(look)] if variant == 'azul' else [f.copy() for f in look]
    final = blue_original(rest, 'atencion', 0) if variant == 'azul' else rest.copy()
    nuevos = []
    registrations = []
    for i, (group, bbox) in enumerate(zip(groups, bounds)):
        extracted = extractor.component_group_image(source, group, padding=0)
        offset = bbox[0] - bounds[0][0]
        source_pose = Image.new('RGBA', source.size)
        source_pose.alpha_composite(extracted, (bbox[0], bbox[1]))
        # Inversa del mapeo destino = escala * (origen - offset) + desplazamiento.
        frame = source_pose.transform((W, H), Image.Transform.AFFINE,
            (1/SCALE, 0, offset-DX/SCALE, 0, 1/SCALE, -DY/SCALE), Image.Resampling.BICUBIC)
        frame.paste(final.crop((0, FIXED_Y, W, H)), (0, FIXED_Y))
        nuevos.append(frame)
        registrations.append({'source_bbox': list(bbox), 'x_offset': offset})
    frames = primeros + nuevos + [final]
    folder = HERE / 'frames' / variant
    folder.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGBA', (len(frames)*W, H))
    for i, frame in enumerate(frames):
        frame.save(folder / f'respuesta_{i:02d}.png')
        atlas.alpha_composite(frame, (i*W, 0))
    atlas.save(HERE / f'spritesheet_respuesta_sombrero_{variant}.png')
    frames[0].save(HERE / f'prueba_{variant}.webp', save_all=True, append_images=frames[1:], duration=times, loop=0, lossless=True)
    matte = []
    for frame in frames:
        bg = Image.new('RGBA', frame.size, '#f3ead8'); bg.alpha_composite(frame); matte.append(bg.convert('RGB'))
    matte[0].save(HERE / f'prueba_{variant}.gif', save_all=True, append_images=matte[1:], duration=times, loop=0, disposal=2)
    sheet = Image.new('RGB', (3*300, 3*365), '#f3ead8')
    painter = ImageDraw.Draw(sheet)
    for i, frame in enumerate(frames):
        thumb = frame.resize((280, 317), Image.Resampling.LANCZOS)
        x, y = (i%3)*300+10, (i//3)*365+30
        sheet.paste(thumb, (x, y), thumb)
        painter.text((x, y-22), f'{i}: {labels[i]}', fill='#40372e')
    sheet.save(HERE / f'contacto_{variant}.jpg', quality=94)
    fixed = all(ImageChops.difference(f.crop((0,FIXED_Y,W,H)), final.crop((0,FIXED_Y,W,H))).getbbox(alpha_only=False) is None for f in frames)
    edge_pixels = []
    for i, frame in enumerate(frames):
        a=frame.getchannel('A')
        pixels=sum(1 for v in list(a.crop((0,0,W,1)).getdata())+list(a.crop((0,H-1,W,H)).getdata())+list(a.crop((0,0,1,H)).getdata())+list(a.crop((W-1,0,W,H)).getdata()) if v)
        edge_pixels.append(pixels)
        if pixels: raise RuntimeError(f'{variant} cuadro {i}: dibujo cortado en borde')
    report['variants'][variant] = {'source_size': list(source.size), 'components': registrations, 'frame_count': len(frames), 'frame_size': [W,H], 'lower_scene_identical': fixed, 'initial_look_is_original': frames[3].tobytes() == primeros[3].tobytes(), 'final_pose_is_original': frames[-1].tobytes() == final.tobytes(), 'edge_pixels': edge_pixels}
    if not fixed: raise RuntimeError(f'{variant}: la parte inferior no es estable')
(HERE/'qa/registro.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
metadata = {'name':'gaucho_respuesta_cierre_sombrero','status':'versión revisada e integrada en React; tiempos ajustables','frame_size':[W,H],'frame_count':9,'variants':['rojo','azul'],'atlas':'spritesheet_respuesta_sombrero_{variant}.png','frames':[{'index':i,'label':label,'rect':[i*W,0,W,H]} for i,label in enumerate(labels)], 'playback':{'sequence':list(range(9)),'durations_ms':times[:-1]+[0],'loop':False,'hold_last':True,'keep_answer_visible':True},'preview':{'durations_ms':times,'loop':True},'qa_report':'qa/registro.json','limitations':'Los cuadros nuevos son dibujos generados completos de la parte superior. Pueden variar levemente el trazo, los pliegues y la disposición de las cartas respecto de las poses originales. El cambio de mazo azul/rojo puede presentar pequeñas diferencias entre ambas variantes generadas.'}
(HERE/'animacion.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
