export class ProgressService {
  private timer: number | null = null;

  start(
    onProgress: (progress: number) => void,
    max = 95
  ) {
    let progress = 0;

    onProgress(progress);

    this.stop();

    this.timer = window.setInterval(() => {
      if (progress >= max) return;

      progress += Math.floor(Math.random() * 8) + 2;

      if (progress > max) {
        progress = max;
      }

      onProgress(progress);
    }, 180);
  }

  finish(
    onProgress: (progress: number) => void
  ) {
    this.stop();
    onProgress(100);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}