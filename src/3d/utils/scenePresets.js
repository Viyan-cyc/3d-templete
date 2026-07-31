const scenePresets = {
  /** 深色室内/数字孪生（默认） */
  dark: {
    name: "\u6DF1\u8272\u6570\u5B57\u5B6A\u751F",
    scene: {
      background: "#1a1a2e",
      environment: { preset: "room", intensity: 1 }
    },
    camera: {
      type: "perspective",
      position: [15, 12, 15],
      lookAt: [0, 0, 0],
      perspective: { fov: 50, near: 0.1, far: 1e3 }
    },
    lights: [
      { type: "ambient", intensity: 0.5, color: "#ffffff" },
      {
        type: "hemisphere",
        intensity: 0.4,
        skyColor: "#b0c4de",
        groundColor: "#444444",
        position: [0, 50, 0]
      },
      {
        type: "directional",
        intensity: 1.2,
        color: "#ffffff",
        position: [10, 20, 10],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 2048,
          camera: { near: 0.5, far: 100, left: -30, right: 30, top: 30, bottom: -30 }
        }
      }
    ]
  },
  /** 浅色户外/城市规划 */
  outdoor: {
    name: "\u6D45\u8272\u6237\u5916",
    scene: {
      background: "#87CEEB",
      environment: { preset: "city", intensity: 0.9 },
      fog: { type: "linear", color: "#aecbe6", near: 80, far: 220 }
    },
    camera: {
      type: "perspective",
      position: [45, 38, 55],
      lookAt: [0, 4, 0],
      perspective: { fov: 50, near: 0.1, far: 1e3 }
    },
    lights: [
      { type: "ambient", intensity: 0.65, color: "#ffffff" },
      {
        type: "hemisphere",
        intensity: 0.5,
        skyColor: "#87CEEB",
        groundColor: "#a0a0a0",
        position: [0, 50, 0]
      },
      {
        type: "directional",
        intensity: 1.5,
        color: "#fff4e0",
        position: [40, 60, 30],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 4096,
          camera: { near: 0.5, far: 200, left: -60, right: 60, top: 60, bottom: -60 }
        }
      }
    ]
  },
  /** 工业/仓库/车间 */
  industrial: {
    name: "\u5DE5\u4E1A\u8F66\u95F4",
    scene: {
      background: "#2a2a2e",
      environment: { preset: "warehouse", intensity: 0.8 },
      fog: { type: "linear", color: "#2a2a2e", near: 50, far: 150 }
    },
    camera: {
      type: "perspective",
      position: [20, 15, 20],
      lookAt: [0, 2, 0],
      perspective: { fov: 55, near: 0.1, far: 500 }
    },
    lights: [
      { type: "ambient", intensity: 0.3, color: "#c0c0c0" },
      {
        type: "hemisphere",
        intensity: 0.3,
        skyColor: "#888899",
        groundColor: "#333333",
        position: [0, 30, 0]
      },
      {
        type: "directional",
        intensity: 1,
        color: "#ffe8cc",
        position: [15, 25, 10],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 2048,
          camera: { near: 0.5, far: 80, left: -25, right: 25, top: 25, bottom: -25 }
        }
      },
      {
        type: "directional",
        intensity: 0.6,
        color: "#ffffff",
        position: [-10, 20, -15],
        target: [0, 0, 0],
        castShadow: false
      }
    ]
  },
  /** 简约白底/产品展示 */
  studio: {
    name: "\u7B80\u7EA6\u767D\u5E95",
    scene: {
      background: "#f0f0f0",
      environment: { preset: "studio", intensity: 1.2 }
    },
    camera: {
      type: "perspective",
      position: [5, 4, 5],
      lookAt: [0, 1, 0],
      perspective: { fov: 45, near: 0.1, far: 100 }
    },
    lights: [
      { type: "ambient", intensity: 0.8, color: "#ffffff" },
      {
        type: "hemisphere",
        intensity: 0.6,
        skyColor: "#ffffff",
        groundColor: "#dddddd",
        position: [0, 10, 0]
      },
      {
        type: "directional",
        intensity: 1,
        color: "#ffffff",
        position: [5, 8, 5],
        target: [0, 0, 0],
        castShadow: true,
        shadow: {
          mapSize: 1024,
          camera: { near: 0.5, far: 30, left: -8, right: 8, top: 8, bottom: -8 }
        }
      }
    ]
  }
};
function registerScenePreset(key, preset) {
  scenePresets[key] = preset;
}
function getScenePresets() {
  return { ...scenePresets };
}
function mergeCamera(cfgCam, presetCam) {
  const type = cfgCam.type ?? "perspective";
  const merged = {
    ...presetCam,
    ...cfgCam,
    type
  };
  if (type === "orthographic") {
    delete merged.perspective;
  } else {
    delete merged.orthographic;
  }
  return merged;
}
function mergeWithPreset(config, presetKey) {
  const preset = scenePresets[presetKey] ?? scenePresets.dark;
  const pScene = preset.scene;
  const pCamera = preset.camera;
  const pLights = preset.lights;
  return {
    version: config.version ?? "1.0",
    angleUnit: config.angleUnit ?? "deg",
    scene: config.scene ? {
      ...pScene,
      ...config.scene,
      fog: config.scene.fog ?? pScene?.fog,
      environment: config.scene.environment ?? pScene?.environment
    } : { ...pScene },
    camera: config.camera ? mergeCamera(config.camera, pCamera) : { ...pCamera },
    lights: config.lights ?? pLights,
    objects: config.objects
  };
}
export {
  getScenePresets,
  mergeWithPreset,
  registerScenePreset
};
