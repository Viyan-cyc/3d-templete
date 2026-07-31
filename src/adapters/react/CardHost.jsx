import { Fragment, jsx } from "react/jsx-runtime";
import { createPortal } from "react-dom";
function CardHost({ cards, registry }) {
  return /* @__PURE__ */ jsx(Fragment, { children: cards.map((card) => {
    if (!card.visible || !card.domElement || !registry) return null;
    const CardComponent = registry.get(card.type);
    if (!CardComponent) return null;
    return /* @__PURE__ */ jsx(CardPortal, { domElement: card.domElement, children: /* @__PURE__ */ jsx(
      CardComponent,
      {
        cardId: card.id,
        objectId: card.objectId,
        ...card.props
      }
    ) }, card.id);
  }) });
}
function CardPortal({ domElement, children }) {
  return createPortal(children, domElement);
}
export {
  CardHost
};
