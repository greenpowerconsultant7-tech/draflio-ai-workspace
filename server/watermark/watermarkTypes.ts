export type WatermarkMode =
  | "single"
  | "repeated";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkPageScope =
  | {
      type: "all";
    }
  | {
      type: "selected";
      pages: number[];
    };

export type WatermarkApiOptions = {
  text: string;

  fontSize: number;

  color: string;

  opacity: number;

  rotation: number;

  mode: WatermarkMode;

  position: WatermarkPosition;

  horizontalGap: number;

  verticalGap: number;

  scope: WatermarkPageScope;
};

export type WatermarkApiRequest = {
  filename?: string;

  options: WatermarkApiOptions;
};

export type ValidatedWatermarkRequest = {
  filename: string;

  options: WatermarkApiOptions;
};