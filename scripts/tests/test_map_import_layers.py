import copy
import unittest
from test_map_import import SOURCE, CAMPUS, META, CONFIG, LAYER
from map_import.normalise import normalise
from map_import.geometry import prepare_geometry, preview_features


class VectorLayerTests(unittest.TestCase):
    def test_parcel_street_address_cannot_create_road_surface_or_trees(self):
        from map_import.semantics import mapped_properties, surface_class
        self.assertNotEqual(surface_class('13 PROFESSOR STREET'), 'road')
        result=mapped_properties({'NAME':'13 PROFESSOR STREET'},{'nameField':'NAME','sourceLayerName':'UNILAG Parcels'},'landcover')
        self.assertEqual(result['landClass'],'parcel')
        self.assertNotEqual(result.get('vegetation'),'trees')
    def test_merge_retains_absent_layers_and_explicit_replacement_removes(self):
        initial=normalise([copy.deepcopy(LAYER)],SOURCE,CAMPUS,[META],CONFIG,'one')
        previous=[p['after'] for p in initial['proposals'] if p['after']]
        empty={**LAYER,'features':[]}
        merged=normalise([empty],SOURCE,CAMPUS,previous,CONFIG,'two')
        self.assertEqual(merged['summary']['counts']['removed'],0)
        replaced=normalise([empty],SOURCE,CAMPUS,previous,{**CONFIG,'refreshMode':'replace-layer'},'two')
        self.assertGreater(replaced['summary']['counts']['removed'],0)

    def test_renamed_layer_preserves_identity_and_owner_corrections(self):
        initial=normalise([copy.deepcopy(LAYER)],SOURCE,CAMPUS,[META],CONFIG,'one')
        previous=[p['after'] for p in initial['proposals'] if p['after']]
        renamed={**copy.deepcopy(LAYER),'name':'renamed'}
        config={**CONFIG,'layers':[{**CONFIG['layers'][0],'layer':'renamed','identity':LAYER['name']}]}
        result=normalise([renamed],SOURCE,CAMPUS,previous,config,'two')
        self.assertEqual(result['summary']['counts']['added'],0)
        feature=next(r for r in previous if r['entity']=='feature');feature['source']='campus-review'
        feature['payload']['properties']['appearance']={'wallColour':'#123456'}
        result=normalise([renamed],SOURCE,CAMPUS,previous,config,'three')
        self.assertFalse(any(p['source_id']==feature['id'] for p in result['proposals']))

    def test_geometry_collection_components_are_stable_and_not_dropped(self):
        layer=copy.deepcopy(LAYER)
        layer['features'][0]['geometry']={'type':'GeometryCollection','geometries':[{'type':'Point','coordinates':[3.2,6.46]},layer['features'][0]['geometry']]}
        config={**CONFIG,'layers':[{**CONFIG['layers'][0],'role':'overlay'}]}
        result=normalise([layer],SOURCE,CAMPUS,[META],config,'one')
        self.assertFalse(result['summary']['errors'])
        self.assertEqual(len([p for p in result['proposals'] if p.get('after',{}).get('entity')=='feature']),2)

    def test_sampling_includes_late_small_layers(self):
        large={**LAYER,'features':LAYER['features']*3000}
        small={**LAYER,'name':'sidewalks'}
        preview,sampling=preview_features([large,small],20)
        self.assertEqual(len(preview['features']),20)
        self.assertEqual(sampling[1]['shown'],len(small['features']))

    def test_sampling_spreads_across_the_entire_layer(self):
        large={**LAYER,'features':[{**LAYER['features'][0],'id':i} for i in range(10000)]}
        preview,_=preview_features([large],10)
        ids=[f['id'] for f in preview['features']]
        self.assertEqual(ids[0],0)
        self.assertEqual(ids[-1],9999)
        self.assertEqual(len(set(ids)),10)

    def test_osm_public_tags_exclude_unmapped_private_attributes(self):
        from map_import.semantics import public_tags
        self.assertEqual(public_tags({'name':'Lane','access':'private','foot:conditional':'no @ (night)','owner_phone':'123','survey_notes':'private'}),{'name':'Lane','access':'private','foot:conditional':'no @ (night)'})

    def test_road_surface_preserves_class_and_never_adds_routes(self):
        layer=copy.deepcopy(LAYER);layer['features'][0]['properties']['NAME']='Drive-Unpaved'
        config={**CONFIG,'layers':[{**CONFIG['layers'][0],'role':'road-surface','nameField':'NAME'}]}
        result=normalise([layer],SOURCE,CAMPUS,[META],config,'one')
        records=[p['after'] for p in result['proposals'] if p['after']]
        feature=next(r for r in records if r['entity']=='feature')
        self.assertEqual(feature['payload']['properties']['landClass'],'road')
        self.assertEqual(feature['payload']['properties']['surface'],'unpaved')
        self.assertFalse(any(r['entity'] in ('node','edge') for r in records))

    def test_duplicate_identifiers_are_reported_even_for_identical_features(self):
        layer=copy.deepcopy(LAYER);layer['features']*=2
        result=normalise([layer],SOURCE,CAMPUS,[META],CONFIG,'one')
        self.assertTrue(any('duplicate source identity' in e for e in result['summary']['errors']))

    def test_multipoint_destinations_keep_every_component(self):
        layer=copy.deepcopy(LAYER);layer['features'][0]['geometry']={'type':'MultiPoint','coordinates':[[3.2,6.46],[3.20001,6.46001]]}
        config={**CONFIG,'layers':[{**CONFIG['layers'][0],'role':'place'}]}
        result=normalise([layer],SOURCE,CAMPUS,[META],config,'one')
        self.assertFalse(result['summary']['errors'])
        self.assertEqual(len([p for p in result['proposals'] if p.get('after',{}).get('entity')=='place']),2)

    def test_collapsed_polygon_requires_review(self):
        with self.assertRaisesRegex(ValueError,'components|dimension'):
            prepare_geometry({'type':'Polygon','coordinates':[[[3.2,6.46],[3.201,6.46],[3.202,6.46],[3.2,6.46]]]})


if __name__=='__main__':unittest.main()
