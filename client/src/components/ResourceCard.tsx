import React, { useMemo, useState } from "react";
import { MapPinIcon, BookmarkIcon, LinkIcon } from "@heroicons/react/24/outline";
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

export const ResourceCard: React.FC<{ resource: Resource }> = ({ resource }) => {
  const [showMore, setShowMore] = useState(false);

  const address = useMemo(() => {
    const parts = [
      resource.addressLine1,
      resource.city,
      resource.state,
      resource.zip,
    ].filter(Boolean);
    return parts.join(", ");
  }, [resource.addressLine1, resource.city, resource.state, resource.zip]);

  const websiteHref = useMemo(() => formatWebsite(resource.website), [resource.website]);

  return (
    <div className="flex flex-col border-b border-[#3B75A9] transition-all ease-in-out duration-300">
      <div className="text-black py-2">
        <h2 className="mt-1 font-bold text-md">
          {resource.name || "Untitled organization"}
        </h2>
      </div>

      {/* Address */}
      {address && (
        <div className="flex items-center text-sm py-2 text-[#0E3052]">
          <MapPinIcon className="h-6 w-6 mr-2 flex-shrink-0 [stroke-width:2]" />
          <div className="flex-grow min-w-0 whitespace-normal break-words">
            {address}
          </div>
        </div>
      )}

      {/* Type */}
      {resource.orgType && (
        <div className="flex items-center text-sm py-2 text-[#0E3052]">
          <BookmarkIcon className="h-6 w-6 mr-2 flex-shrink-0 [stroke-width:2]" />
          <div className="flex-grow min-w-0 whitespace-normal break-words">
            {resource.orgType}
          </div>
        </div>
      )}

      {/* Website */}
      {websiteHref && (
        <div className="flex items-center text-sm py-2 text-[#0E3052]">
          <LinkIcon className="h-6 w-6 mr-2 flex-shrink-0 [stroke-width:2]" />
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="md:hover:text-[#1E79C8] transition-colors ease-in-out duration-300 flex-grow min-w-0 whitespace-normal break-words"
          >
            {resource.website}
          </a>
        </div>
      )}

      <div className="pt-4 pb-6">
        <button
          aria-label={`Learn more about ${resource.name}`}
          onClick={() => setShowMore((v) => !v)}
          className="border border-[#1E79C8] text-[#1E79C8] hover:bg-[#3892E1] hover:text-white text-sm cursor-pointer px-12 py-2 rounded-full transition-colors duration-300 flex items-center justify-center gap-2 font-semibold"
        >
          {showMore ? "Collapse" : "Learn More"}
        </button>

        {showMore && (
          <div className="my-4 text-md">
            {resource.servicesIndividuals && (
              <div className="my-4">
                <p className="my-2 font-semibold">Services</p>
                <p className="whitespace-normal break-words">
                  {resource.servicesIndividuals}
                </p>
              </div>
            )}

            {(resource.contactName || resource.contactEmail || resource.phone || resource.contactTitle) && (
              <div className="my-4">
                <p className="my-2 font-semibold">Contact Information</p>
                {resource.contactName && (
                  <p className="whitespace-normal break-words">{resource.contactName}</p>
                )}
                {resource.contactTitle && (
                  <p className="whitespace-normal break-words">{resource.contactTitle}</p>
                )}

                {resource.contactEmail && (
                  <p className="whitespace-normal break-words">
                    <a
                      href={`mailto:${resource.contactEmail}`}
                      className="md:hover:text-[#1E79C8] transition-colors ease-in-out duration-300"
                    >
                      {resource.contactEmail}
                    </a>
                  </p>
                )}

                {resource.phone && (
                  <p className="whitespace-normal break-words">
                    <a
                      href={`tel:${resource.phone}`}
                      className="md:hover:text-[#1E79C8] transition-colors ease-in-out duration-300"
                    >
                      {resource.phone}
                    </a>
                  </p>
                )}
              </div>
            )}

            {resource.serviceArea && (
              <div className="my-4">
                <p className="my-2 font-semibold">Service Area</p>
                <p className="whitespace-normal break-words">{resource.serviceArea}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
