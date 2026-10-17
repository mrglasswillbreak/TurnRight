"""Add this Python toolbox to ArcGIS Pro. Results remain private local files."""
import importlib.util
import json
from pathlib import Path
import arcpy

spec = importlib.util.spec_from_file_location('turnright_arcgis_bridge', Path(__file__).with_name('bridge.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class Toolbox:
    def __init__(self):
        self.label = 'TurnRight Campus Detail'
        self.alias = 'turnright'
        self.tools = [DiscoverSources, InspectCoverage, CompareCampus, ExportCandidates]


class BaseTool:
    canRunInBackground = False

    def getParameterInfo(self):
        fields = [('baseline', 'Current TurnRight campus JSON', 'DEFile', self.operation in {'discover', 'compare'}),
                  ('input', 'Discovery / inspection JSON', 'DEFile', self.operation != 'discover'),
                  ('campus_id', 'Target TurnRight campus UUID', 'GPString', self.operation == 'discover'),
                  ('campus_name', 'Campus name (LASU Ojo / UNILAG Akoka)', 'GPString', self.operation == 'discover'),
                  ('output', 'New output JSON / ZIP', 'DEFile', True),
                  ('signed_in', 'Use current ArcGIS Pro portal session', 'GPBoolean', False)]
        return [arcpy.Parameter(name=name, displayName=label, datatype=kind,
                                parameterType='Required' if required else 'Optional',
                                direction='Output' if name == 'output' else 'Input') for name, label, kind, required in fields]

    def execute(self, parameters, messages):
        values = {p.name: p.valueAsText for p in parameters}
        baseline = json.loads(Path(values['baseline']).read_bytes()) if values['baseline'] else None
        source = json.loads(Path(values['input']).read_bytes()) if values['input'] else None
        output = values['output']
        signed_in = values['signed_in'] == 'true'
        if self.operation == 'discover': bridge.discover(baseline, values['campus_id'], values['campus_name'], output, signed_in)
        elif self.operation == 'inspect': bridge.inspect(source, output, signed_in)
        elif self.operation == 'compare': bridge.compare(baseline, source, Path(values['input']).parent, output)
        else: bridge.export_bundle(source, Path(values['input']).parent, output)
        messages.addMessage('Saved private review output: ' + output)


class DiscoverSources(BaseTool):
    label = '1. Discover campus sources'
    description = 'Search public and accessible portal collections by campus extent.'
    operation = 'discover'


class InspectCoverage(BaseTool):
    label = '2. Inspect layers and coverage'
    description = 'Resolve and deduplicate vector layers; retrieve complete snapshots and provenance.'
    operation = 'inspect'


class CompareCampus(BaseTool):
    label = '3. Compare with TurnRight'
    description = 'Account for candidates and every baseline building without accepting corrections.'
    operation = 'compare'


class ExportCandidates(BaseTool):
    label = '4. Export candidate bundle'
    description = 'Export a verified ZIP for the existing TurnRight Import data workflow.'
    operation = 'export'
