import { createComponentObject } from "../../../library/library-bridge";
const wallHandler = {
  create(data, _ctx) {
    const obj = createComponentObject("Wall", data.component?.options ?? {});
    if (obj) {
      obj.name = data.id;
      obj.userData.__id = data.id;
    }
    return obj;
  }
};
export {
  wallHandler
};
