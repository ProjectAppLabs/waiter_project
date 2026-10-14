'use client'
/* eslint-disable @next/next/no-img-element -- Exporty assistant reminder illustration. */
import {useEffect,useRef} from 'react'
import Link from 'next/link'
import {useDinerStore} from '@/lib/stores/dinerStore'
import {Icon,useSmartRoute} from './SmartMenu'
export function SmartAssistantReminder() {
 const {keys,preview}=useDinerStore()
 const {href}=useSmartRoute()
 const dialog=useRef<HTMLDialogElement>(null)
 const storage=`smart-menu:assistant-reminder:${keys?.rest}:${keys?.venue}`
 useEffect(()=>{
  if(preview)return
  try{if(sessionStorage.getItem(storage))return}catch{return}
  const timer=setTimeout(()=>{
   if(document.visibilityState!=='visible'||document.querySelector('dialog[open]'))return
   try{sessionStorage.setItem(storage,'shown');dialog.current?.showModal()}catch{}
  },300000)
  return()=>clearTimeout(timer)
 },[storage,preview])
 return <dialog className="sm-filter-dialog sm-reminder" ref={dialog}><button className="sm-icon" aria-label="Cerrar sugerencia" onClick={()=>dialog.current?.close()}><Icon name="close"/></button><img src="/smart-menu/assistant.png" alt=""/><h2>¿Te ayudamos a elegir?</h2><p>Responde unas preguntas y encuentra opciones según tus gustos.</p><Link className="sm-primary" href={href('asistente')} onClick={()=>dialog.current?.close()}>Elegir con el asistente<Icon name="arrow"/></Link><button className="sm-text-button" onClick={()=>dialog.current?.close()}>Seguir explorando</button></dialog>
}
