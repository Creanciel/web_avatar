import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { useEffect, useRef, type RefObject } from "react";
import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

const VRM_URL = "/models/AliciaSolid.vrm";
const CANVAS_SIZE = 512;

const loadVRM = async (url: string): Promise<VRM> => {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;

  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
  });

  return vrm;
};

const useRendering = (
  refCanvas: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onError?: (e: unknown) => void,
) => {
  useEffect(() => {
    if (!enabled) return;
    const canvas = refCanvas.current;
    if (!canvas) return;

    const camera = new PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.25, 2.4);
    camera.lookAt(0, 1.3, 0);

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false);
    renderer.setClearColor(0x000000, 0);

    const scene: Scene = (() => {
      const directionLight = new DirectionalLight(0xffffff, 1.8);
      directionLight.position.set(0, 1.25, 2.4);
      directionLight.target.position.set(0, 1.3, 0);

      const ambientLight = new AmbientLight(0xffffff, 1.0);

      return new Scene().add(ambientLight, directionLight, directionLight.target);
    })();

    let vrm: VRM | null = null;
    let disposed = false;

    loadVRM(VRM_URL)
      .then((loaded) => {
        if (disposed) {
          VRMUtils.deepDispose(loaded.scene);
          return;
        }
        scene.add(loaded.scene);
        vrm = loaded;
      })
      .catch((err) => {
        console.error("Failed to load VRM:", err);
        onError?.(err);
      });

    let raf = 0;
    const tick = () => {
      if (vrm) {
        // animation
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer.dispose();
    };
  }, [enabled]);
};

const Canvas = () => {
  const refCanvas = useRef<HTMLCanvasElement>(null);

  useRendering(refCanvas, true, (e) => {
    console.error(e);
  });

  return (
    <div className="size-full border">
      <canvas
        ref={refCanvas}
        className="size-full"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
      ></canvas>
    </div>
  );
};

export default Canvas;
