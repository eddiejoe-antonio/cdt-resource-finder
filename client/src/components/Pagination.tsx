// src/components/Pagination.tsx
import React from "react";

export default function Pagination(props: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const { currentPage, totalPages, onPageChange } = props;
  if (totalPages <= 1) return null;

  const clamp = (p: number) => Math.max(1, Math.min(totalPages, p));

  return (
    <div className="mt-10 flex items-center justify-center gap-3">
      <button
        className="px-3 py-2 rounded-lg border border-[#3B75A9] disabled:opacity-40"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(clamp(currentPage - 1))}
      >
        Prev
      </button>

      <div className="text-sm text-[#0E3052]">
        Page <span className="font-semibold">{currentPage}</span> of{" "}
        <span className="font-semibold">{totalPages}</span>
      </div>

      <button
        className="px-3 py-2 rounded-lg border border-[#3B75A9] disabled:opacity-40"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(clamp(currentPage + 1))}
      >
        Next
      </button>
    </div>
  );
}
