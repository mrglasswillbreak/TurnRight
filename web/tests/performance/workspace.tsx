import { createRoot } from "react-dom/client";
import { PhotoManager } from "../../src/PhotoManager";
import type { CampusData, MapEdit } from "../../src/types";
import "../../src/styles.css";
import "../../src/editor.css";

const data: CampusData = await (await fetch("/fixture-campus.json")).json();
const building = data.map.features.find((f) => f.properties?.kind === "building")!;
const edit: MapEdit = {
  id: String(building.properties!.id),
  kind: "building",
  geometry: building.geometry,
  properties: building.properties!,
};
createRoot(document.getElementById("root")!).render(
  <PhotoManager
    edit={edit}
    data={data}
    owner="performance-owner"
    onApply={() => {}}
    onUndo={() => {}}
    saveStatus="Saved"
  />,
);
