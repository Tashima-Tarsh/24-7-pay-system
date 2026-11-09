import * as React from 'react';import{cn}from'../../lib/utils';
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('rounded-[20px] border border-[#d8d8ca] bg-white p-6 shadow-[0_16px_44px_rgba(15,45,31,.055)]',className)} {...props}/>;}
export function CardTitle({className,...props}:React.HTMLAttributes<HTMLHeadingElement>){return <h2 className={cn('text-base font-semibold tracking-tight text-[#183d30]',className)} {...props}/>;}
