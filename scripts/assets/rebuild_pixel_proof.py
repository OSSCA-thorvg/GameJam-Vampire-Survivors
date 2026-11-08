"""Read-only image measurements, executed inside the pinned authoring environment."""
from pathlib import Path
import json
import subprocess
from rebuild_common import digest, portable


MEASURE_CODE = '''from PIL import Image
import numpy as np,json,sys
a=np.array(Image.open(sys.argv[1]).convert('RGBA')); b=np.array(Image.open(sys.argv[2]).convert('RGBA'))
def box(mask):
 y,x=np.where(mask)
 return [int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)] if len(x) else None
sourceMask=a[:,:,3]>=128; finalMask=b[:,:,3]>0
s=box(sourceMask); f=box(finalMask); h,w=b.shape[:2]
blocks=b.reshape(h//2,2,w//2,2,4)
out={'size':[w,h],'mode':'RGBA','alphaValues':np.unique(b[:,:,3]).tolist(),
 'visibleColors':len(np.unique(b[finalMask,:3],axis=0)),
 'grid':{'physicalPitch':2,'phase':[0,0],'uniformFraction':float(np.mean(np.all(blocks==blocks[:,0:1,:,0:1,:],axis=(1,3,4))))},
 'sourceBox':s,'sourceCanvasBox':box(a[:,:,3]>0),'box':f,
 'visiblePalette':np.unique(b[finalMask,:3],axis=0).tolist(),
 'sourceSolidPixels':int(sourceMask.sum()),'nonzeroPixels':int(finalMask.sum()),
 'boundaryPixels':int(finalMask[0,:].sum()+finalMask[-1,:].sum()+finalMask[:,0].sum()+finalMask[:,-1].sum())}
out['occupancyRatio']=out['nonzeroPixels']/max(1,out['sourceSolidPixels'])
out['boxRatios']=[(f[i+2]-f[i])/max(1,s[i+2]-s[i]) for i in [0,1]] if f and s else [0,0]
if sys.argv[3]=='1':
 inner=b[4:20,4:156]; rgb=inner[:,:,:3].astype(float); luma=rgb.mean(axis=2)
 red=(rgb[:,:,0]>=90)&(rgb[:,:,0]-rgb[:,:,1]>=35)&(rgb[:,:,0]-rgb[:,:,2]>=35)
 out['hpTrack']={'outer':[0,0,160,24],'nativeFillRect':[4,4,152,16],
  'opaqueInnerPixels':int(np.count_nonzero(inner[:,:,3]==255)), 'innerPixels':int(inner.shape[0]*inner.shape[1]),
  'bakedRedPixels':int(np.count_nonzero(red)), 'innerMeanLuma':float(luma.mean()),
  'innerBrightFraction':float(np.mean(luma>100))}
print(json.dumps(out))
'''


def measure(source: Path, final: Path, tool: Path, opaque: bool, hp_track: bool = False) -> dict:

    result = subprocess.run([str(tool.with_name('python')), '-c', MEASURE_CODE, str(source), str(final), str(int(hp_track))],
                            text=True, capture_output=True, check=True)
    proof = json.loads(result.stdout)
    proof.update(sourceFile=portable(source), sourceSha256=digest(source),
                 outputFile=portable(final), outputSha256=digest(final))
    if not proof['box'] or proof['visibleColors'] > 64 or proof['grid']['uniformFraction'] != 1:
        raise ValueError('Pixel output is empty, exceeds its palette, or lost the integer grid')
    if ((opaque and proof['alphaValues'] != [255]) or
            (not opaque and not hp_track and proof['alphaValues'] != [0, 255]) or
            (hp_track and (255 not in proof['alphaValues'] or not set(proof['alphaValues']) <= {0, 255}))):
        raise ValueError('Pixel output alpha differs from its opaque/binary contract')
    if proof['occupancyRatio'] < 0.6 or min(proof['boxRatios']) < 0.75:
        raise ValueError('Pixel output collapsed relative to its normalized source')
    if hp_track:
        validate_hp_track(proof)
    return proof


def validate_hp_track(proof: dict) -> None:
    track = proof['hpTrack']
    if proof['size'] != [160, 24] or proof['box'] != [0, 0, 160, 24]:
        raise ValueError('HP track must occupy the complete160x24 canvas')
    if track['opaqueInnerPixels'] != 152 * 16 or track['innerPixels'] != 152 * 16:
        raise ValueError('HP native fill needs an opaque neutral152x16 inner track at4,4')
    if track['bakedRedPixels'] or track['innerMeanLuma'] > 80 or track['innerBrightFraction'] > 0.05:
        raise ValueError('HP track must be empty neutral dark with no baked red or filled highlight')
