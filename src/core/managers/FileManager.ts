export class FileManager {
  private files: File[] = [];

  constructor(initialFiles: File[] = []) {
    this.files = [...initialFiles];
  }

  getAll(): File[] {
    return [...this.files];
  }

  add(files: File[]) {
    this.files.push(...files);
  }

  remove(index: number) {
    this.files.splice(index, 1);
  }

  clear() {
    this.files = [];
  }

  replace(files: File[]) {
    this.files = [...files];
  }

  reorder(oldIndex: number, newIndex: number) {
    const updated = [...this.files];

    const [item] = updated.splice(oldIndex, 1);

    updated.splice(newIndex, 0, item);

    this.files = updated;
  }

  count() {
    return this.files.length;
  }

  totalSize() {
    return this.files.reduce(
      (sum, file) => sum + file.size,
      0
    );
  }

  isEmpty() {
    return this.files.length === 0;
  }
}