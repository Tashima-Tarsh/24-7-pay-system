import * as React from 'react';import{cn}from'../../lib/utils';
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('premium-surface rounded-[22px] border p-5 sm:p-6',className)} {...props}/>;}
export function CardTitle({className,...props}:React.HTMLAttributes<HTMLHeadingElement>){return <h2 className={cn('text-base font-semibold tracking-tight text-[#183d30]',className)} {...props}/>;}
