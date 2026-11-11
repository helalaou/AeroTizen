export const compileShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export const getWebGL = (canvas: HTMLCanvasElement, attributes: WebGLContextAttributes = {}) => {
  try {
    return canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      failIfMajorPerformanceCaveat: true,
      ...attributes,
    });
  } catch {
    return null;
  }
};
