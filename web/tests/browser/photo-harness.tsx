import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PhotoOptimizer from '../../src/PhotoOptimizer';
import '../../src/fonts.css';
import '../../src/styles.css';
function Fixture() {
  const [request, setRequest] = useState<{ files: File[] } | null>(null);
  return (
    <>
      <label>
        Add test photograph
        <input
          aria-label="Add test photograph"
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setRequest({ files: [...(e.target.files || [])] })}
        />
      </label>
      {request && (
        <PhotoOptimizer
          owner="photo-test-owner"
          target="building:fixture"
          request={request}
          onClose={() => setRequest(null)}
          onReady={() => {}}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('photo-test-root')!).render(<Fixture />);
