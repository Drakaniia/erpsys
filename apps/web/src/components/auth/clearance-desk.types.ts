/**
 * Minimal plain-data types matching the /isometric Drawing model contract,
 * kept local so `apps/web` needs no external package dependency.
 */
export type Axis = "x" | "y" | "z";
export type Vec3 = [number, number, number];
export type Role =
  | "body"
  | "face"
  | "detail"
  | "ink"
  | "accent"
  | "plinth"
  | "ruler"
  | "glass";
export type Paint = Role | "bg" | "soft";
export type FaceName = "top" | "bottom" | "front" | "back" | "left" | "right";

export type Shape =
  | { kind: "box"; at: Vec3; size: Vec3; r?: number; axis?: Axis; seg?: number }
  | {
      kind: "cyl";
      at: Vec3;
      r: number;
      h: number;
      r2?: number;
      axis?: Axis;
      n?: number;
    }
  | {
      kind: "prism";
      at: Vec3;
      profile: [number, number][];
      len: number;
      axis?: Axis;
    }
  | { kind: "sphere"; at: Vec3; r: number };

export interface Rot {
  axis: Axis;
  deg: number;
  pivot: Vec3;
}

export type Decal =
  | {
      t: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r?: number;
      fill?: Paint;
      stroke?: boolean | "soft" | Paint;
      opacity?: number;
    }
  | {
      t: "circle";
      cx: number;
      cy: number;
      r: number;
      fill?: Paint;
      stroke?: boolean | "soft" | Paint;
      opacity?: number;
    }
  | {
      t: "line";
      pts: [number, number][];
      stroke?: true | "soft" | Paint;
      closed?: boolean;
      fill?: Paint;
      width?: number;
    }
  | {
      t: "segs";
      segs: [number, number, number, number][];
      stroke?: true | "soft" | Paint;
      width?: number;
    }
  | { t: "bar"; x: number; y: number; w: number; h?: number; fill?: Paint }
  | {
      t: "text";
      x: number;
      y: number;
      size: number;
      text: string;
      anchor?: "start" | "middle" | "end";
      fill?: Paint;
    };

export interface Part {
  id?: string;
  shape: Shape;
  role?: Role;
  decals?: Partial<Record<FaceName, Decal[]>>;
  rot?: Rot[];
  group?: string;
  bias?: number;
  fixed?: boolean;
  only?: "standing" | "lying";
}

export type Ease = "linear" | "inOut" | "out" | "in" | "back";

export interface Track {
  group: string;
  t?: Vec3;
  r?: Rot;
  s?: { k: Vec3; pivot: Vec3 };
  from?: number;
  to?: number;
  ease?: Ease;
  mode?: "yoyo" | "loop";
}

export interface Motion {
  duration: number;
  tracks: Track[];
  label?: string;
}

export interface Drawing {
  id: string;
  name: string;
  category: string;
  tags: string[];
  kind: "icon" | "scene";
  prompt: string;
  description: string;
  createdAt: string;
  pose?: "standing" | "lying";
  plinth?: { margin?: number; w?: number; d?: number };
  parts: Part[];
  motion?: Motion;
}
