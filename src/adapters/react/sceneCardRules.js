import InfoCard from "@/components/cards/InfoCard";
const groupHeight = (meshes) => meshes.reduce((mx, m) => Math.max(mx, m.position.y), 0);
const cardRules = [
  {
    type: "tree",
    component: InfoCard,
    pattern: /^(tree\d+)_/,
    // tree01_trunk / tree01_canopy ... → id=tree01
    anchor: "highest",
    // 卡片飘在树顶
    offset: [0, 0.6, 0],
    interactiveGroup: "scene",
    // 全局互斥：同时只显示一张卡片
    props: ({ id, anchor, meshes }) => ({
      kind: "tree",
      label: `\u6811 ${id.replace(/^tree/, "").padStart(2, "0")}`,
      position: [anchor.position.x, anchor.position.z],
      height: groupHeight(meshes)
    })
  },
  {
    type: "building",
    component: InfoCard,
    pattern: /^(building[A-Z])_/,
    // buildingA_body / buildingA_window ... → id=buildingA
    anchor: "_body",
    // 锚点取 *_body，找不到回退第一个 mesh
    offset: [0, 0.6, 0],
    interactiveGroup: "scene",
    props: ({ id, anchor, meshes }) => ({
      kind: "building",
      label: `\u5EFA\u7B51 ${id.replace(/^building/, "")}`,
      position: [anchor.position.x, anchor.position.z],
      height: groupHeight(meshes)
    })
  }
];
export {
  cardRules
};
