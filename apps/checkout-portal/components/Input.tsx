import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="mb-3">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`block w-full px-3 py-2 text-sm text-slate-900 bg-white border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
          error ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500' : 'border-slate-300 focus:ring-slate-500 focus:border-slate-500'
        } ${className ?? ''}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
