/**
 * WebGL2 보드 렌더러 — 2개 평면(상대/나) + 존 쿼드.
 * 텍스트는 WebGL 밖의 2D 오버레이가 담당한다(카드명·수치는 SDF/오버레이가 정답).
 */
export interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number; // 0 = 가까운 쪽, 1 = 먼 쪽
  color: [number, number, number];
  border?: [number, number, number];
}

const VERT = `#version 300 es
in vec2 aPos;
in vec3 aCol;
uniform vec2 uRes;
out vec3 vCol;
void main() {
  vec2 p = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  vCol = aCol;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 oCol;
void main() { oCol = vec4(vCol, 1.0); }`;

export class BoardRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vbo: WebGLBuffer;
  private aPos: number;
  private aCol: number;
  private uRes: WebGLUniformLocation;
  private data: number[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 를 사용할 수 없습니다');
    this.gl = gl;

    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.aCol = gl.getAttribLocation(prog, 'aCol');
    this.uRes = gl.getUniformLocation(prog, 'uRes')!;
    this.vbo = gl.createBuffer()!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private rect(x: number, y: number, w: number, h: number, depth: number, c: [number, number, number]): void {
    // 2.5D: 먼 쪽은 작아지고 위로 살짝 눌린다(투시 근사)
    const k = 1 - 0.16 * depth;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const hw = (w * k) / 2;
    const hh = (h * k) / 2;
    const skew = 0.06 * depth; // 사다리꼴
    const topHW = hw * (1 - skew);
    const pts: Array<[number, number]> = [
      [cx - topHW, cy - hh],
      [cx + topHW, cy - hh],
      [cx + hw, cy + hh],
      [cx - hw, cy + hh],
    ];
    const tri = [0, 1, 2, 0, 2, 3];
    for (const i of tri) {
      const p = pts[i]!;
      this.data.push(p[0] * (this.canvas.width / parseFloat(this.canvas.style.width || '1')), p[1] * (this.canvas.height / parseFloat(this.canvas.style.height || '1')), c[0], c[1], c[2]);
    }
  }

  draw(quads: Quad[]): void {
    const gl = this.gl;
    this.data = [];
    for (const q of quads) this.rect(q.x, q.y, q.w, q.h, q.depth, q.color);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.027, 0.067, 0.059, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.data.length) return;

    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data), gl.DYNAMIC_DRAW);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aCol);
    gl.vertexAttribPointer(this.aCol, 3, gl.FLOAT, false, stride, 2 * 4);
    gl.drawArrays(gl.TRIANGLES, 0, this.data.length / 5);
  }
}
