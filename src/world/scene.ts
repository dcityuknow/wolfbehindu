import * as THREE from "three";
import { LIGHT } from "../config";

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c") as HTMLCanvasElement, antialias: true });
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
export const torch = new THREE.PointLight(0xfff2cc, LIGHT.torch, LIGHT.torchRange, 2);

scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x02030a, LIGHT.fogPlay);
scene.add(new THREE.AmbientLight(0x8899ff, LIGHT.ambient), torch);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
export const render = () => renderer.render(scene, camera);
