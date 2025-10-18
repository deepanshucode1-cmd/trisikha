import React from 'react'

const ProgressBar = () => {
  return (
        <svg className="animate-spin w-18 h-6" viewBox="0 0 50 50">
                  <circle
                    cx="25"
                    cy="25"
                    r="20"
                    strokeWidth="5"
                    className="text-gray-300"
                    stroke="currentColor"
                    fill="none"
                  />
                  <circle
                    cx="25"
                    cy="25"
                    r="20"
                    strokeWidth="5"
                    className="text-blue-500"
                    stroke="currentColor"
                    fill="none"
                    strokeDasharray="125"
                    strokeDashoffset="75"
                    strokeLinecap="round"
                  />
                </svg>
  )
}

export default ProgressBar