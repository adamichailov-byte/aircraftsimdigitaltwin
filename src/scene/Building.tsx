import type { BuildingSpec } from '../demo/campus';
import { scenePalette } from '../models/materials';
import { InstancedBlock } from '../models/RepeatedBlocks';

export function Block({ at, size, color, shadow = true }: {
  at: [number, number, number]; size: [number, number, number]; color: string; shadow?: boolean;
}) {
  return <InstancedBlock at={at} size={size} color={color} shadow={shadow} />;
}

export function Building({ spec, roofs, showBeams }: { spec: BuildingSpec; roofs: boolean; showBeams: boolean }) {
  const { lengthM: length, widthM: width, heightM: height, doorWidthM: door,
    doorHeightM: opening, centerM } = spec;
  const columns = Math.ceil(length / 48);
  const sideHeight = roofs ? height : 2;
  return <group position={[centerM[0], 0.7, centerM[1]]}>
    {spec.northDoor ? <group>
      {[-1,1].map(side=>{const edge=spec.northDoor!.centerOffsetM+side*spec.northDoor!.widthM/2;
        const end=side*length/2;return <Block key={side} at={[(edge+end)/2,height/2,-width/2]} size={[Math.abs(end-edge),height,1.4]} color={scenePalette.cladding}/>;})}
      <Block at={[spec.northDoor.centerOffsetM,(height+spec.northDoor.heightM)/2,-width/2]} size={[spec.northDoor.widthM,height-spec.northDoor.heightM,1.4]} color={scenePalette.cladding}/>
    </group> : <Block at={[0, height / 2, -width / 2]} size={[length, height, 1.4]} color={scenePalette.cladding} />}
    <Block at={[0, sideHeight / 2, width / 2]} size={[length, sideHeight, 1.4]} color={scenePalette.cladding} />
    {[-1, 1].map(end => {
      const doors = [{ center: 0, width: door, height: opening },
        ...(end === 1 ? (spec.additionalEndDoors ?? []).map(additional => ({
          center: additional.centerOffsetM, width: additional.widthM, height: additional.heightM,
        })) : spec.westDoor?[{center:spec.westDoor.centerOffsetM,width:spec.westDoor.widthM,height:spec.westDoor.heightM}]:[])].sort((a, b) => a.center - b.center);
      const wallSegments = doors.flatMap((item, index) => {
        const start = item.center - item.width / 2;
        const previousEnd = index === 0 ? -width / 2 : doors[index - 1].center + doors[index - 1].width / 2;
        return start > previousEnd ? [{ start: previousEnd, end: start }] : [];
      });
      const lastEnd = doors.at(-1)!.center + doors.at(-1)!.width / 2;
      if (lastEnd < width / 2) wallSegments.push({ start: lastEnd, end: width / 2 });
      return <group key={end} position={[end * length / 2, 0, 0]}>
        {wallSegments.map(({ start, end: finish }, index) => <Block key={index}
          at={[0, sideHeight / 2, (start + finish) / 2]}
          size={[1.4, sideHeight, finish - start]} color={scenePalette.cladding} />)}
        {doors.map((item, index) => <group key={index}>
          <Block at={[0, item.height + (height - item.height) / 2, item.center]}
            size={[1.8, height - item.height, item.width]} color={scenePalette.cladding} />
          {[-1, 1].map(side => <Block key={side}
            at={[0, item.height / 2, item.center + side * (item.width / 2 + 1)]}
            size={[2.2, item.height, 2]} color={scenePalette.steel} />)}
        </group>)}
      </group>;
    })}
    {Array.from({ length: columns + 1 }, (_, index) => {
      const xM = -length / 2 + 3 + index * (length - 6) / columns;
      return <group key={index}>
        {[-1, 1].filter(side=>!(side===-1&&spec.northDoor&&Math.abs(xM-spec.northDoor.centerOffsetM)<spec.northDoor.widthM/2+1)).map(side => <Block key={side} at={[xM, height / 2, side * (width / 2 - 2)]}
          size={[1.8, height, 1.8]} color={scenePalette.steel} />)}
        {showBeams && <Block at={[xM, height + 0.8, 0]} size={[1.2, 1.6, width]} color={scenePalette.steel} />}
      </group>;
    })}
    {showBeams && [-1, 1].map(side => <Block key={side} at={[0, height + 1, side * (width / 2 - 2)]}
      size={[length, 2, 1.8]} color={scenePalette.steel} />)}
    {spec.id === 'assembly' && [-72, 72].map(xM => <group key={xM}>
      {[-115, 115].map(zM => <Block key={zM} at={[xM, height / 2, zM]}
        size={[2, height, 2]} color={scenePalette.steel} />)}
      {showBeams && <Block at={[xM, height + 0.8, 0]} size={[1.8, 1.6, width]} color={scenePalette.steel} />}
    </group>)}
    {roofs ? <group>
      <Block at={[0, height + 1.5, 0]} size={[length + 5, 2.2, width + 5]} color={scenePalette.cladding} />
      {[-1, 1].map(side => <Block key={side} at={[0, height + 2.65, side * width * 0.27]}
        size={[length - 10, 0.12, 7]} color={scenePalette.skylight} shadow={false} />)}
      {Array.from({ length: columns + 1 }, (_, index) => <Block key={index}
        at={[-length / 2 + index * length / columns, height + 2.65, 0]}
        size={[0.25, 0.1, width + 4]} color={scenePalette.roofSeam} shadow={false} />)}
    </group> : <Block at={[0, height + 0.8, -width * 0.42]}
      size={[length + 4, 1.2, width * 0.18]} color={scenePalette.cladding} />}
  </group>;
}
