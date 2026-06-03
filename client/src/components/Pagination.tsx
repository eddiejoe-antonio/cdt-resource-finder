// src/components/Pagination.tsx
type PerPageOption = 12 | 36 | 72 | "all";

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;

  perPage: PerPageOption;
  onPerPageChange: (value: PerPageOption) => void;
};

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  perPage,
  onPerPageChange,
}: Props) {
  const clamp = (p: number) => Math.max(1, Math.min(totalPages, p));
  const perPageOptions: PerPageOption[] = [12, 36, 72, "all"];

  return (
    <div style={{ paddingBottom: 32, marginBottom: 16 }}>
      <style>{`
        .pagination-btn:focus-visible {
          outline: 3px solid #1a6faf !important;
          outline-offset: 2px !important;
          box-shadow: none !important;
        }
      `}</style>
      <div className="row align-items-center g-3">
        {/* ✅ Left third: Pagination */}
        <div className="col-12 col-md-4">
          {totalPages > 1 ? (
            <nav
              aria-label="Pagination"
              className="d-flex align-items-center gap-2 flex-wrap"
            >
              <button
                type="button"
                className="btn btn-outline-primary pagination-btn"
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
                className="btn btn-outline-primary pagination-btn"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(clamp(currentPage + 1))}
              >
                Next
              </button>
            </nav>
          ) : (
            // keep height consistent if only 1 page
            <div aria-hidden="true" style={{ height: 44 }} />
          )}
        </div>

        {/* ✅ Middle third: spacer (empty) */}
        <div className="d-none d-md-block col-md-4" aria-hidden="true" />

        {/* ✅ Right third: Results per page (right aligned on desktop) */}
        <div className="col-12 col-md-4">
          <div className="d-flex align-items-center gap-2 justify-content-start justify-content-md-end">
            <style>{`#per-page-select:focus-visible{outline:2px solid #1a6faf!important;outline-offset:0!important;box-shadow:none!important;border-color:#1a6faf!important}`}</style>
            <label htmlFor="per-page-select" className="m-0">
              Results per page:
            </label>

            <select
              id="per-page-select"
              className="form-select"
              style={{ width: 180, maxWidth: "100%", border: "2px solid #595959" }}
              value={perPage}
              onChange={(e) =>
                onPerPageChange(
                  e.target.value === "all"
                    ? "all"
                    : (Number(e.target.value) as PerPageOption)
                )
              }
            >
              {perPageOptions.map((opt) => (
                <option key={String(opt)} value={opt}>
                  {opt === "all" ? "All" : opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}