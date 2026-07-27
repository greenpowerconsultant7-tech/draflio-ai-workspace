/**
 * Ambient compatibility surface required by @types/three for its optional
 * WebGPU ExternalTexture declaration. RE3B uses WebGL only.
 */
interface GPUTexture {
  readonly __draflioWebGpuTextureBrand?: never;
}
