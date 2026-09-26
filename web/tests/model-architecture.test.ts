import {expect,it} from 'vitest';
import type {MapEdit} from '../src/types';
import {addBuildingBoundary,addEllipseBoundary,documentForBuilding,modelCoordinates,roundBoundaryCorner,setBoundaryCurve} from '../src/model-architecture';
import {buildingTopology,resolveBuildingVisual} from '../src/building-surfaces';
import {facadeWalls} from '../src/building-facades';
import {modelFeature,wallLength} from '../src/model-authoring';
import {validateEdit} from '../src/editor-model';
import {createBuildingModel} from '../src/building-model';
const edit=():MapEdit=>({id:'test',kind:'building',geometry:{type:'Polygon',coordinates:[[[3.2,6.46],[3.2002,6.46],[3.2002,6.4602],[3.2,6.4602],[3.2,6.46]]]},properties:{name:'Building',height:6,heightMode:'metres'}});
it('adds a closed wing and courtyard without changing existing boundaries',()=>{
  const base=edit(),wing=[[3.2003,6.46],[3.2004,6.46],[3.2004,6.4601],[3.2003,6.4601]];
  const added=addBuildingBoundary(base,'wing',wing);expect(added.geometry.type).toBe('MultiPolygon');expect(validateEdit(added)).toEqual([]);
  const hole=addBuildingBoundary(base,'courtyard',[[3.20005,6.46005],[3.2001,6.46005],[3.2001,6.4601],[3.20005,6.4601]]);expect(validateEdit(hole)).toEqual([]);
  expect(buildingTopology(modelFeature(added)).parts[0]).toEqual(buildingTopology(modelFeature(base)).parts[0]);
});
it('retains the logical wall and facade identities when a curve changes',()=>{
  const base=edit(),doc=documentForBuilding(base),convert=modelCoordinates(doc.origin),a=convert.local([3.2,6.46]),b=convert.local([3.2002,6.46]);
  const curved=setBoundaryCurve(base,0,0,0,{id:'curve',kind:'arc',through:[(a[0]+b[0])/2,a[1]-3,0],end:b});
  expect(validateEdit(curved)).toEqual([]);
  const walls=facadeWalls(modelFeature(curved));expect(walls).toHaveLength(4);expect(walls[0].wallId).toBe('test:wall:0:0:0');expect(walls[0].coordinates.length).toBeGreaterThan(2);expect(wallLength(walls[0].coordinates)).toBeGreaterThan(wallLength(facadeWalls(modelFeature(base))[0].coordinates));
  const second=setBoundaryCurve(curved,0,0,0,{id:'ignored',kind:'arc',through:[(a[0]+b[0])/2,a[1]-4,0],end:b});
  expect(second.properties.modelDocument!.curves[0].id).toBe('curve');expect(facadeWalls(modelFeature(second))[0].wallId).toBe(walls[0].wallId);
  const feature=modelFeature(second),model=createBuildingModel(feature,resolveBuildingVisual(feature),{previewUnreviewed:true});expect(model.meshes.length).toBeGreaterThan(0);
});
it('rounds corners and records editable elliptical wing curves',()=>{
  const base=edit(),rounded=roundBoundaryCorner(base,0,0,0,1);expect(validateEdit(rounded)).toEqual([]);expect(rounded.properties.modelDocument!.curves).toHaveLength(1);
  const oval=addEllipseBoundary(base,'wing',[35,0,0],10,6);expect(validateEdit(oval)).toEqual([]);expect(oval.properties.modelDocument!.curves).toHaveLength(4);
  expect(()=>roundBoundaryCorner(base,0,0,0,50)).toThrow(/smaller radius/);
});
