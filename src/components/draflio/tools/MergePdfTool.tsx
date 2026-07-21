import { useState } from "react";

export default function MergePdfTool() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.files) return;

    setFiles(Array.from(event.target.files));
  };

  return (
    <div className="rounded-xl border p-6 bg-white shadow-sm">

      <h2 className="text-2xl font-bold mb-4">
        Merge PDF
      </h2>

      <input
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileChange}
      />

      <div className="mt-6">

        <h3 className="font-semibold mb-2">
          Selected Files
        </h3>

        {files.length === 0 ? (
          <p>No PDF selected.</p>
        ) : (
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li
                key={index}
                className="rounded border p-2"
              >
                {file.name}
              </li>
            ))}
          </ul>
        )}

      </div>

    </div>
  );
}