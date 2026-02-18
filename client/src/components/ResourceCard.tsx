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

  // ✅ NEW: pass audience-specific Free/Low Cost from ResourceFinder
  freeLowCostToShow?: string;
};

export const ResourceCard: React.FC<Props> = ({
  resource,
  servicesToShow,
  freeLowCostToShow,
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
    const sv = resource.servicesIndividuals;
    return sv?.trim() ? sv.trim() : "";
  }, [resource.servicesIndividuals]);

  const servicesText = useMemo(() => {
    if (servicesToShow && servicesToShow.length > 0) {
      return servicesToShow.join(", ");
    }
    return fallbackServicesText;
  }, [servicesToShow, fallbackServicesText]);

  const iconStyle: React.CSSProperties = { fontSize: "1.5rem", lineHeight: 1 };
// src/components/ResourceCard.tsx

  const addressLink = useMemo(() => {
    // only link if we actually have a URL and an address
    if (!address) return "";
    return resource.googleMapsUrl?.trim() || "";
  }, [address, resource.googleMapsUrl]);


  return (
    <article className="card h-100">
      <div className="card-body bg-gray-50 shadow-sm rounded-md border-gray-300 border d-flex flex-column h-100">
        <div>
          <h4 className="h5 m-0">{resource.name || "Untitled organization"}</h4>

          <ul className="list-unstyled m-t-md m-b-0">
            {address && (
              <li className="d-flex align-items-start m-b-sm">
                <span
                  className="ca-gov-icon-location m-r-sm flex-shrink-0"
                  aria-hidden="true"
                  style={iconStyle}
                />

                {addressLink ? (
                  <a
                    href={addressLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-normal min-w-0"
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                    aria-label={`Open ${resource.name || "this location"} in Google Maps (opens in a new tab)`}
                  >
                    {address}
                  </a>
                ) : (
                  <span className="text-normal">{address}</span>
                )}
              </li>
            )}
            {servicesText && (
              <li className="d-flex align-items-start m-b-sm">
                <span
                  className="ca-gov-icon-tool m-r-sm flex-shrink-0"
                  aria-hidden="true"
                  style={iconStyle}
                />
                <span className="text-normal">
                  <span>{servicesText}</span>
                </span>
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
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  {resource.website}
                </a>
              </li>
            )}
          </ul>

          {showMore && (
            <div id={detailsId} className="m-t-md">
              {resource.serviceDelivery && (
                <p className="m-b-sm">
                  <span className="fw-bold">In-person/virtual:</span>{" "}
                  {resource.serviceDelivery}
                </p>
              )}

              {resource.languages && (
                <p className="m-b-sm">
                  <span className="fw-bold">Language:</span> {resource.languages}
                </p>
              )}

              {freeLowCostToShow && (
                <p className="m-b-sm">
                  <span className="fw-bold">Free/Low Cost:</span>{" "}
                  {freeLowCostToShow}
                </p>
              )}

              {resource.contactEmail && (
                <p className="m-b-sm">
                  <span className="fw-bold">Email:</span>{" "}
                  <a href={`mailto:${resource.contactEmail}`}>
                    {resource.contactEmail}
                  </a>
                </p>
              )}

              {resource.phone && (
                <p className="m-b-sm">
                  <span className="fw-bold">Phone number:</span>{" "}
                  <a href={`tel:${resource.phone}`}>{resource.phone}</a>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="m-t-md mt-auto">
          <button
            type="button"
            className="btn btn-outline-primary"
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
