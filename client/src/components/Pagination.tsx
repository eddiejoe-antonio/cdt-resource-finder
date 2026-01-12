// src/components/Pagination.tsx
type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;
  const clamp = (p: number) => Math.max(1, Math.min(totalPages, p));

  return (
    <nav aria-label="Pagination" className="m-t-md m-b-lg d-flex justify-content-center align-items-center gap-2">
      <button
        type="button"
        className="btn btn-primary-outline"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(clamp(currentPage - 1))}
      >
        Previous
      </button>

      <span className="m-x-sm">
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>

      <button
        type="button"
        className="btn btn-primary-outline"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(clamp(currentPage + 1))}
      >
        Next
      </button>
    </nav>
  );
}

