'use client';

import React from 'react';

// Figma-aligned primitives used by the menu-item Details tab.
// File bpnbCfGmcUAW25nYHli2Lf, nodes 0:95 (section card), 0:104 (label),
// 0:106 (input), 0:145 (textarea).

export function SectionCard({
  title,
  headerRight,
  children,
  className = '',
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative bg-[#18181b] border border-[rgba(255,255,255,0.1)] rounded-[12px] p-[25px] flex flex-col gap-6 shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1 h-6 rounded-full bg-[#f54900] shrink-0" />
          <h2 className="text-[18px] leading-[28px] text-[#fafafa] truncate">{title}</h2>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-[14px] leading-[20px] text-[#9f9fa9]">{label}</label>
      )}
      {children}
      {hint && <p className="text-[12px] leading-[16px] text-[#9f9fa9]">{hint}</p>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Dark-mode input matching Figma: 36px tall, bg #27272a, 6px radius,
// subtle shadow, 14px text. No visible border (shadow provides depth).
export const FormInput = React.forwardRef<HTMLInputElement, InputProps>(function FormInput(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full h-9 rounded-[6px] bg-[#27272a] px-3 py-[9.5px] text-[14px] leading-none text-[#fafafa] placeholder:text-[rgba(250,250,250,0.5)] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-[#f54900] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function FormTextarea(
  { className = '', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`w-full min-h-[80px] rounded-[8px] bg-[#27272a] border border-[rgba(255,255,255,0.15)] px-4 py-2 text-[14px] leading-[20px] text-[#fafafa] placeholder:text-[rgba(250,250,250,0.5)] resize-y focus:outline-none focus:ring-2 focus:ring-[#f54900] ${className}`}
    />
  );
});
