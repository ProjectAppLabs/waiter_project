'use client'
import {useEffect,useState,type ReactNode} from 'react'
import {SmartAbout} from './SmartJourneys'

export function FirstVisitIntro({restaurant,enabled,children}: {restaurant:string;enabled:boolean;children:ReactNode}) {
 const [seen,setSeen]=useState<boolean|null>(null)
 const cookie=`waiter_intro_${encodeURIComponent(restaurant)}_v1`
 useEffect(()=>{setSeen(document.cookie.split(';').some(part=>part.trim()===`${cookie}=1`))},[cookie])
 const finish=()=>{
  document.cookie=`${cookie}=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`
  setSeen(true)
 }
 if(!enabled||seen)return <>{children}</>
 if(seen===null)return null
 return <div className="smart-menu"><div className="sm-page"><SmartAbout onDone={finish}/></div></div>
}
