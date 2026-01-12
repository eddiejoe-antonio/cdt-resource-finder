// src/components/ResourceCard.tsx
import React, { useMemo, useState, useId } from "react";
import type { Resource } from "../types/resourceTypes";

function formatWebsite(url?: string) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

type Props = {
  resource: Resource;
  servicesToShow?: string[];
  servicesLabel?: string;
};

export const ResourceCard: React.FC<Props> = ({
  resource,
  servicesToShow,
  servicesLabel = "Service type",
}) => {
  const [showMore, setShowMore] = useState(false);
  const detailsId = useId();

  const address = useMemo(() => {
    const parts = [
      resource.addressLine1,
      resource.city,
      resource.state,
      resource.zip,
    ].filter(Boolean);
    return parts.join(", ");
  }, [resource.addressLine1, resource.city, resource.state, resource.zip]);

  const websiteHref = useMemo(
    () => formatWebsite(resource.website),
    [resource.website]
  );

  const fallbackServicesText = useMemo(() => {
    const s = resource.servicesIndividuals;
    return s?.trim() ? s.trim() : "";
  }, [resource.servicesIndividuals]);

  const servicesText = useMemo(() => {
    if (servicesToShow && servicesToShow.length > 0) return servicesToShow.join(", ");
    return fallbackServicesText;
  }, [servicesToShow, fallbackServicesText]);

  const iconStyle: React.CSSProperties = { fontSize: "1.5rem", lineHeight: 1 };

  return (
    <article className="card h-100">
      {/* Make the card-body a flex column and fill height */}
      <div className="card-body bg-gray-50 shadow-sm rounded-md border-gray-300 border d-flex flex-column h-100">
        <div>
          <h5 className="h5 m-0">{resource.name || "Untitled organization"}</h5>

          <ul className="list-unstyled m-t-md m-b-0">
            {address && (
              <li className="d-flex align-items-start m-b-sm">
                <span
                  className="ca-gov-icon-location m-r-sm flex-shrink-0"
                  aria-hidden="true"
                  style={iconStyle}
                />
                <span className="text-normal">{address}</span>
              </li>
            )}

            {resource.orgType && (
              <li className="d-flex align-items-start m-b-sm">
                <span
                  className="ca-gov-icon-tool m-r-sm flex-shrink-0"
                  aria-hidden="true"
                  style={iconStyle}
                />
                <span className="text-normal">{resource.orgType}</span>
              </li>
            )}

              {websiteHref && (
                <li className="d-flex align-items-start">
                  <span
                    className="ca-gov-icon-globe m-r-sm flex-shrink-0"
                    aria-hidden="true"
                    style={iconStyle}
                  />
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0"
                    style={{
                      overflowWrap: "anywhere",  // best for long URLs
                      wordBreak: "break-word",   // fallback
                    }}
                  >
                    {resource.website}
                  </a>
                </li>
              )}
          </ul>

          {/* Details stay above the button */}
          {showMore && (
            <div id={detailsId} className="m-t-md">
              {servicesText && (
                <section className="m-b-md">
                  <h5 className="h5">{servicesLabel}:</h5>
                  <p className="m-0">{servicesText}</p>
                </section>
              )}

              {(resource.contactName ||
                resource.contactEmail ||
                resource.phone ||
                resource.contactTitle) && (
                <section className="m-b-md">
                  <h5 className="h5">Contact information</h5>

                  {resource.contactName && <p className="m-0">{resource.contactName}</p>}
                  {resource.contactTitle && <p className="m-0">{resource.contactTitle}</p>}

                  {resource.contactEmail && (
                    <p className="m-0">
                      <a href={`mailto:${resource.contactEmail}`}>{resource.contactEmail}</a>
                    </p>
                  )}

                  {resource.phone && (
                    <p className="m-0">
                      <a href={`tel:${resource.phone}`}>{resource.phone}</a>
                    </p>
                  )}
                </section>
              )}

              {resource.serviceArea && (
                <section>
                  <h3 className="h4">Service area</h3>
                  <p className="m-0">{resource.serviceArea}</p>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Button pushed to the bottom of the card */}
        <div className="m-t-md mt-auto">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-controls={detailsId}
          >
            {showMore ? "Show less" : "Learn more"}
          </button>
        </div>
      </div>
    </article>
  );
};
