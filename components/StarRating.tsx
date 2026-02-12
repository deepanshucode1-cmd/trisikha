"use client";

import { useState } from "react";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (rating: number) => void;
  showCount?: boolean;
  count?: number;
}

const sizeMap = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-7 h-7",
};

function StarIcon({
  filled,
  half,
  className,
}: {
  filled: boolean;
  half?: boolean;
  className: string;
}) {
  if (half) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="halfStar">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill="url(#halfStar)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export default function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  interactive = false,
  onRate,
  showCount = false,
  count,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const displayRating = interactive ? hoverRating || rating : rating;

  const stars = [];
  for (let i = 1; i <= maxRating; i++) {
    const filled = i <= Math.floor(displayRating);
    const half = !filled && i === Math.ceil(displayRating) && displayRating % 1 >= 0.25;

    stars.push(
      <span
        key={i}
        className={`${interactive ? "cursor-pointer" : ""} ${
          filled || half ? "text-amber-400" : "text-gray-300"
        }`}
        onClick={interactive ? () => onRate?.(i) : undefined}
        onMouseEnter={interactive ? () => setHoverRating(i) : undefined}
        onMouseLeave={interactive ? () => setHoverRating(0) : undefined}
        role={interactive ? "button" : undefined}
        aria-label={interactive ? `Rate ${i} out of ${maxRating}` : undefined}
      >
        <StarIcon filled={filled} half={half} className={sizeMap[size]} />
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex">{stars}</div>
      {showCount && count !== undefined && count > 0 && (
        <span className="text-sm text-gray-500 ml-1">
          ({count})
        </span>
      )}
    </div>
  );
}
