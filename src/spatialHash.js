// 廣相碰撞：把 2D (x, z) 空間切格子，查詢半徑內鄰居
// 每幀 clear() → insert() 全部物件 → query 多次

export class SpatialHash {
  constructor(cellSize) {
    this.cell = cellSize;
    this.invCell = 1 / cellSize;
    this.map = new Map();        // key "x,z" -> Array<index>
    this._result = [];
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  clear() {
    this.map.clear();
  }

  insertXZ(index, x, z) {
    const cx = Math.floor(x * this.invCell);
    const cz = Math.floor(z * this.invCell);
    const k = this._key(cx, cz);
    let bucket = this.map.get(k);
    if (!bucket) { bucket = []; this.map.set(k, bucket); }
    bucket.push(index);
  }

  /** 查詢以 (x, z) 為中心、半徑 r 內所有 index */
  queryXZ(x, z, r) {
    const cell = this.cell;
    const minCx = Math.floor((x - r) * this.invCell);
    const maxCx = Math.floor((x + r) * this.invCell);
    const minCz = Math.floor((z - r) * this.invCell);
    const maxCz = Math.floor((z + r) * this.invCell);
    this._result.length = 0;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.map.get(this._key(cx, cz));
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) this._result.push(bucket[i]);
        }
      }
    }
    return this._result;
  }
}
