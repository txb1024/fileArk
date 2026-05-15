import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base64ToUint8Array } from "./utils";
import type * as ThreeNS from "three";

export function Model3DPreview({ base64, ext }: { base64: string; ext: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ vertices: number; faces: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupFn: (() => void) | null = null;

    (async () => {
      try {
        const THREE = (await import("three")) as typeof ThreeNS;
        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1d23);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
        camera.position.set(5, 5, 5);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(5, 10, 5);
        scene.add(directional);
        const directional2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directional2.position.set(-5, -5, -5);
        scene.add(directional2);

        const grid = new THREE.GridHelper(20, 20, 0x444444, 0x2a2a2a);
        scene.add(grid);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;

        const bytes = base64ToUint8Array(base64);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        let object: ThreeNS.Object3D | null = null;
        let vertexCount = 0;
        let faceCount = 0;

        if (ext === "stl") {
          const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
          const loader = new STLLoader();
          const geometry = loader.parse(buffer);
          geometry.computeVertexNormals();
          const material = new THREE.MeshPhongMaterial({ color: 0x999fa6, specular: 0x111111, shininess: 100 });
          object = new THREE.Mesh(geometry, material);
          vertexCount = geometry.attributes.position.count;
          faceCount = vertexCount / 3;
        } else if (ext === "obj") {
          const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
          const loader = new OBJLoader();
          const text = new TextDecoder().decode(buffer);
          object = loader.parse(text);
          object.traverse((child: ThreeNS.Object3D) => {
            if ((child as ThreeNS.Mesh).isMesh) {
              const mesh = child as ThreeNS.Mesh;
              const geom = mesh.geometry as ThreeNS.BufferGeometry;
              if (geom.attributes.position) {
                vertexCount += geom.attributes.position.count;
                faceCount += geom.attributes.position.count / 3;
              }
              mesh.material = new THREE.MeshPhongMaterial({ color: 0x999fa6 });
            }
          });
        } else if (ext === "gltf" || ext === "glb") {
          const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
          const loader = new GLTFLoader();
          const gltf = await new Promise<{ scene: ThreeNS.Object3D }>((resolve, reject) =>
            loader.parse(buffer, "", resolve, reject)
          );
          object = gltf.scene;
          object.traverse((child: ThreeNS.Object3D) => {
            if ((child as ThreeNS.Mesh).isMesh) {
              const mesh = child as ThreeNS.Mesh;
              const geom = mesh.geometry as ThreeNS.BufferGeometry;
              if (geom.attributes.position) {
                vertexCount += geom.attributes.position.count;
                faceCount += geom.attributes.position.count / 3;
              }
            }
          });
        } else {
          throw new Error(`不支持的 3D 格式：${ext}`);
        }

        if (!object) throw new Error("加载失败");
        if (cancelled) {
          renderer.dispose();
          return;
        }

        scene.add(object);

        // 居中并缩放到合适大小
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 4 / maxDim;
          object.scale.setScalar(scale);
        }
        camera.position.set(6, 6, 6);
        camera.lookAt(0, 0, 0);
        controls.update();

        setStats({ vertices: vertexCount, faces: Math.floor(faceCount) });
        setLoading(false);

        let raf = 0;
        const animate = () => {
          raf = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
          if (!container) return;
          const w = container.clientWidth;
          const h = container.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        cleanupFn = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        };
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (cleanupFn) cleanupFn();
    };
  }, [base64, ext]);

  if (error) {
    return (
      <div className="preview-error">
        <p>3D 模型加载失败</p>
        <small>{error}</small>
      </div>
    );
  }

  return (
    <div className="preview-model3d-container">
      <div className="model3d-toolbar">
        <span className="model3d-meta">
          {loading ? "加载中..." : stats ? `${stats.vertices.toLocaleString()} 顶点 · ${stats.faces.toLocaleString()} 面` : ""}
        </span>
        <span className="model3d-hint">鼠标拖拽旋转 · 滚轮缩放 · 右键平移</span>
      </div>
      <div ref={containerRef} className="model3d-canvas-wrapper">
        {loading && (
          <div className="model3d-loading">
            <Loader2 size={20} className="spinner" />
            <span>解析模型中...</span>
          </div>
        )}
      </div>
    </div>
  );
}
