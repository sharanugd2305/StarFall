import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'

const WIDTH = 900
const HEIGHT = 500
const SHIP_Y = 420
const DURATION = 45
const STORAGE_KEY = 'starfall-best-score'
const getMultiplier = (combo: number) => Math.min(3, 1 + Math.floor((combo - 1) / 3))

type Drop = {
  x: number
  y: number
  radius: number
  speed: number
  kind: 'crystal' | 'meteor' | 'nova'
  rotation: number
  spin: number
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

type FloatingLabel = {
  x: number
  y: number
  text: string
  color: string
  life: number
  maxLife: number
}

type Game = {
  running: boolean
  remaining: number
  score: number
  lives: number
  shipX: number
  drops: Drop[]
  particles: Particle[]
  floatingLabels: FloatingLabel[]
  shield: number
  shieldCooldown: number
  combo: number
  comboTimer: number
  bank: number
  spawnIn: number
  elapsed: number
  lastFrame: number
}

type Status = 'ready' | 'playing' | 'paused' | 'over'

const createGame = (): Game => ({
  running: false,
  remaining: DURATION,
  score: 0,
  lives: 3,
  shipX: WIDTH / 2,
  drops: [],
  particles: [],
  floatingLabels: [],
  shield: 0,
  shieldCooldown: 0,
  combo: 0,
  comboTimer: 0,
  bank: 0,
  spawnIn: 0.6,
  elapsed: 0,
  lastFrame: 0,
})

const stars = Array.from({ length: 76 }, (_, index) => ({
  x: (index * 137.5 + 41) % WIDTH,
  y: (index * 83.7 + 19) % HEIGHT,
  size: index % 8 === 0 ? 2 : 1,
  alpha: 0.18 + ((index * 17) % 70) / 100,
}))

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game>(createGame())
  const keysRef = useRef({ left: false, right: false })
  const statusRef = useRef<Status>('ready')
  const [status, setStatus] = useState<Status>('ready')
  const [hud, setHud] = useState({ score: 0, lives: 3, remaining: DURATION, shield: 0, shieldActive: false, combo: 0, comboTimer: 0 })
  const [best, setBest] = useState(() => {
    try {
      return Number(window.localStorage.getItem(STORAGE_KEY)) || 0
    } catch (error) {
      console.warn('Could not read the saved personal best.', error)
      return 0
    }
  })

  const changeStatus = useCallback((next: Status) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const startGame = useCallback(() => {
    gameRef.current = { ...createGame(), running: true, lastFrame: performance.now() }
    keysRef.current = { left: false, right: false }
    setHud({ score: 0, lives: 3, remaining: DURATION, shield: 0, shieldActive: false, combo: 0, comboTimer: 0 })
    changeStatus('playing')
  }, [changeStatus])

  const togglePause = useCallback(() => {
    const game = gameRef.current
    if (statusRef.current === 'playing') {
      game.running = false
      changeStatus('paused')
    } else if (statusRef.current === 'paused') {
      game.running = true
      game.lastFrame = performance.now()
      changeStatus('playing')
    }
  }, [changeStatus])

  const activateShield = useCallback(() => {
    const game = gameRef.current
    if (!game.running || game.shieldCooldown > 0) return
    game.shield = 1.35
    game.shieldCooldown = 7
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let frame = 0
    let lastHudUpdate = 0
    let impactUntil = 0

    const draw = () => {
      const game = gameRef.current
      context.clearRect(0, 0, WIDTH, HEIGHT)
      const background = context.createLinearGradient(0, 0, 0, HEIGHT)
      background.addColorStop(0, '#080d1b')
      background.addColorStop(0.55, '#10162a')
      background.addColorStop(1, '#17142a')
      context.fillStyle = background
      context.fillRect(0, 0, WIDTH, HEIGHT)

      const nebula = context.createRadialGradient(WIDTH * 0.72, HEIGHT * 0.32, 12, WIDTH * 0.72, HEIGHT * 0.32, 330)
      nebula.addColorStop(0, 'rgba(77, 66, 160, 0.2)')
      nebula.addColorStop(0.5, 'rgba(46, 64, 127, 0.08)')
      nebula.addColorStop(1, 'rgba(20, 25, 55, 0)')
      context.fillStyle = nebula
      context.fillRect(0, 0, WIDTH, HEIGHT)

      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index]
        const drift = game.running ? game.elapsed * (index % 5 === 0 ? 34 : 9) : 0
        const y = (star.y + drift) % HEIGHT
        const twinkle = 0.75 + Math.sin(game.elapsed * 2.2 + index) * 0.25
        context.globalAlpha = star.alpha * twinkle
        context.fillStyle = '#d5e6ff'
        context.fillRect(star.x, y, star.size, star.size)
        if (index % 13 === 0 && game.running) {
          context.globalAlpha = 0.25
          context.fillRect(star.x, y - 12, 1, 10)
        }
      }
      context.globalAlpha = 1

      const horizon = 150
      const cameraShift = (game.shipX - WIDTH / 2) * 0.16
      const planetX = WIDTH * 0.76 - cameraShift * 0.2
      context.save()
      context.translate(planetX, 102)
      context.rotate(-0.2)
      context.strokeStyle = 'rgba(177, 154, 255, 0.38)'
      context.lineWidth = 3
      context.beginPath()
      context.ellipse(0, 0, 76, 19, 0, Math.PI * 0.08, Math.PI * 0.92)
      context.stroke()
      const planet = context.createRadialGradient(-17, -19, 2, 0, 0, 49)
      planet.addColorStop(0, '#d6d5ff')
      planet.addColorStop(0.2, '#8d8ae5')
      planet.addColorStop(0.7, '#514f9e')
      planet.addColorStop(1, '#292b61')
      context.shadowColor = '#8582ff'
      context.shadowBlur = 28
      context.fillStyle = planet
      context.beginPath()
      context.arc(0, 0, 40, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(207, 204, 255, 0.45)'
      context.lineWidth = 1
      context.beginPath()
      context.ellipse(0, 0, 76, 19, 0, Math.PI * 1.08, Math.PI * 1.92)
      context.stroke()
      context.restore()

      const horizonGlow = context.createRadialGradient(WIDTH / 2 - cameraShift, horizon, 4, WIDTH / 2 - cameraShift, horizon, 250)
      horizonGlow.addColorStop(0, 'rgba(110, 128, 255, 0.34)')
      horizonGlow.addColorStop(1, 'rgba(93, 110, 255, 0)')
      context.fillStyle = horizonGlow
      context.fillRect(0, 0, WIDTH, HEIGHT)

      context.save()
      context.beginPath()
      context.moveTo(0, horizon)
      context.lineTo(WIDTH, horizon)
      context.lineTo(WIDTH, HEIGHT)
      context.lineTo(0, HEIGHT)
      context.closePath()
      context.clip()
      context.lineWidth = 1
      for (let index = 1; index <= 13; index += 1) {
        const progress = ((index / 13 + game.elapsed * 0.22) % 1)
        const y = horizon + progress * progress * (HEIGHT - horizon)
        context.strokeStyle = `rgba(112, 170, 255, ${0.045 + progress * 0.19})`
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(WIDTH, y)
        context.stroke()
      }
      for (let index = -8; index <= 8; index += 1) {
        const bottomX = WIDTH / 2 + index * 75 - cameraShift
        context.strokeStyle = 'rgba(130, 170, 255, 0.12)'
        context.beginPath()
        context.moveTo(WIDTH / 2 - cameraShift, horizon)
        context.lineTo(bottomX, HEIGHT)
        context.stroke()
      }
      context.restore()

      if (performance.now() < impactUntil) {
        context.fillStyle = 'rgba(255, 83, 111, 0.08)'
        context.fillRect(0, 0, WIDTH, HEIGHT)
      }

      const glow = context.createRadialGradient(game.shipX, SHIP_Y, 2, game.shipX, SHIP_Y, 120)
      glow.addColorStop(0, 'rgba(63, 225, 255, 0.12)')
      glow.addColorStop(1, 'rgba(63, 225, 255, 0)')
      context.fillStyle = glow
      context.fillRect(game.shipX - 120, SHIP_Y - 120, 240, 240)

      for (const drop of game.drops) {
        const depth = Math.max(0, drop.y)
        const perspective = 0.28 + depth * 1.52
        const x = WIDTH / 2 + drop.x * (22 + depth * 380) - cameraShift
        const y = horizon + depth * (HEIGHT - horizon + 16)
        const radius = drop.radius * perspective
        context.save()
        context.translate(x, y)
        context.rotate(drop.rotation)
        if (drop.kind === 'crystal') {
          context.shadowColor = '#5cf2ff'
          context.shadowBlur = 22
          context.globalAlpha = 0.22
          context.fillStyle = '#5cf2ff'
          context.beginPath()
          context.arc(0, 0, radius * 1.65, 0, Math.PI * 2)
          context.fill()
          context.globalAlpha = 1
          context.shadowColor = '#5cf2ff'
          context.shadowBlur = 18
          const crystal = context.createLinearGradient(-radius, -radius, radius, radius)
          crystal.addColorStop(0, '#e1ffff')
          crystal.addColorStop(0.45, '#77f3ff')
          crystal.addColorStop(1, '#5297ff')
          context.fillStyle = crystal
          context.beginPath()
          context.moveTo(0, -radius)
          context.lineTo(radius * 0.72, 0)
          context.lineTo(0, radius)
          context.lineTo(-radius * 0.72, 0)
          context.closePath()
          context.fill()
          context.strokeStyle = 'rgba(255,255,255,0.75)'
          context.lineWidth = 1
          context.stroke()
          context.fillStyle = 'rgba(255,255,255,0.65)'
          context.fillRect(-Math.max(1, radius * 0.08), -radius * 0.55, Math.max(1.5, radius * 0.16), radius * 0.8)
        } else if (drop.kind === 'meteor') {
          context.shadowColor = '#ff655f'
          context.shadowBlur = 22
          context.globalAlpha = 0.2
          context.fillStyle = '#ff655f'
          context.beginPath()
          context.arc(0, 0, radius * 1.6, 0, Math.PI * 2)
          context.fill()
          context.globalAlpha = 1
          context.shadowColor = '#ff655f'
          context.shadowBlur = 15
          const meteor = context.createRadialGradient(-radius * 0.35, -radius * 0.4, 1, 0, 0, radius * 1.2)
          meteor.addColorStop(0, '#ffd1a1')
          meteor.addColorStop(0.42, '#ff806b')
          meteor.addColorStop(1, '#a93058')
          context.fillStyle = meteor
          context.beginPath()
          context.arc(0, 0, radius, 0, Math.PI * 2)
          context.fill()
          context.fillStyle = 'rgba(95, 31, 51, 0.65)'
          context.beginPath()
          context.arc(radius * 0.25, -radius * 0.2, radius * 0.22, 0, Math.PI * 2)
          context.fill()
        } else {
          context.shadowColor = '#ffd36e'
          context.shadowBlur = 28
          context.globalAlpha = 0.22
          context.fillStyle = '#ffc85b'
          context.beginPath()
          context.arc(0, 0, radius * 1.8, 0, Math.PI * 2)
          context.fill()
          context.globalAlpha = 1
          const nova = context.createRadialGradient(-radius * 0.3, -radius * 0.4, 1, 0, 0, radius * 1.2)
          nova.addColorStop(0, '#fffce1')
          nova.addColorStop(0.35, '#ffe28a')
          nova.addColorStop(1, '#ff9e43')
          context.fillStyle = nova
          context.shadowBlur = 20
          context.beginPath()
          for (let point = 0; point < 10; point += 1) {
            const angle = -Math.PI / 2 + (point * Math.PI) / 5
            const pointRadius = point % 2 === 0 ? radius : radius * 0.44
            const x = Math.cos(angle) * pointRadius
            const y = Math.sin(angle) * pointRadius
            if (point === 0) context.moveTo(x, y)
            else context.lineTo(x, y)
          }
          context.closePath()
          context.fill()
          context.strokeStyle = 'rgba(255,255,255,0.82)'
          context.lineWidth = 1
          context.stroke()
        }
        if (drop.kind === 'meteor' && depth < 0.72) {
          context.globalAlpha = 0.5
          context.strokeStyle = 'rgba(255, 126, 111, 0.5)'
          context.lineWidth = Math.max(1, radius * 0.18)
          context.beginPath()
          context.moveTo(0, -radius * 0.9)
          context.lineTo(0, -radius * (2.8 + (1 - depth)))
          context.stroke()
        }
        context.restore()
      }

      for (const particle of game.particles) {
        context.globalAlpha = Math.max(0, particle.life / particle.maxLife)
        context.fillStyle = particle.color
        context.shadowColor = particle.color
        context.shadowBlur = 12
        context.beginPath()
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
      context.shadowBlur = 0
      for (const label of game.floatingLabels) {
        context.globalAlpha = Math.max(0, label.life / label.maxLife)
        context.fillStyle = label.color
        context.font = '800 15px Inter, ui-sans-serif, system-ui, sans-serif'
        context.textAlign = 'center'
        context.shadowColor = label.color
        context.shadowBlur = 12
        context.fillText(label.text, label.x, label.y)
      }
      context.globalAlpha = 1
      context.shadowBlur = 0

      context.save()
      context.translate(game.shipX, SHIP_Y)
      context.rotate(game.bank * 0.22)
      context.shadowColor = '#55e9ff'
      context.shadowBlur = 34
      context.fillStyle = 'rgba(85, 233, 255, 0.09)'
      context.beginPath()
      context.ellipse(0, 2, 31, 35, 0, 0, Math.PI * 2)
      context.fill()
      context.shadowColor = '#55e9ff'
      context.shadowBlur = 20
      const hull = context.createLinearGradient(-18, -20, 18, 18)
      hull.addColorStop(0, '#f2ffff')
      hull.addColorStop(0.32, '#77f1ff')
      hull.addColorStop(1, '#4889ff')
      context.fillStyle = hull
      context.beginPath()
      context.moveTo(0, -20)
      context.lineTo(17, 15)
      context.lineTo(8, 12)
      context.lineTo(0, 17)
      context.lineTo(-8, 12)
      context.lineTo(-17, 15)
      context.closePath()
      context.fill()
      context.shadowBlur = 0
      context.fillStyle = '#dffcff'
      context.beginPath()
      context.moveTo(0, -12)
      context.quadraticCurveTo(8, 0, 4, 7)
      context.lineTo(-4, 7)
      context.quadraticCurveTo(-8, 0, 0, -12)
      context.closePath()
      context.fill()
      if (game.running) {
        const flame = 10 + Math.random() * 13
        const exhaust = context.createLinearGradient(0, 13, 0, 13 + flame)
        exhaust.addColorStop(0, 'rgba(210, 255, 255, 0.95)')
        exhaust.addColorStop(0.45, 'rgba(79, 220, 255, 0.8)')
        exhaust.addColorStop(1, 'rgba(119, 105, 255, 0)')
        context.fillStyle = exhaust
        context.beginPath()
        context.moveTo(-6, 12)
        context.lineTo(0, 13 + flame)
        context.lineTo(6, 12)
        context.fill()
      }
      context.restore()

      if (game.shield > 0) {
        const pulse = 1 + Math.sin(game.elapsed * 15) * 0.045
        context.save()
        context.translate(game.shipX, SHIP_Y)
        context.scale(pulse, pulse)
        context.strokeStyle = `rgba(119, 239, 255, ${0.72 + Math.sin(game.elapsed * 13) * 0.18})`
        context.fillStyle = 'rgba(76, 222, 255, 0.1)'
        context.lineWidth = 2
        context.shadowColor = '#66efff'
        context.shadowBlur = 28
        context.beginPath()
        context.ellipse(0, 0, 39, 49, 0, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.restore()
      }
    }

    const finishGame = () => {
      const game = gameRef.current
      game.running = false
      changeStatus('over')
      setHud({ score: game.score, lives: game.lives, remaining: Math.ceil(game.remaining), shield: game.shieldCooldown, shieldActive: game.shield > 0, combo: game.combo, comboTimer: game.comboTimer })
      if (game.score > best) {
        setBest(game.score)
        try {
          window.localStorage.setItem(STORAGE_KEY, String(game.score))
        } catch (error) {
          console.warn('Could not save the personal best.', error)
        }
      }
    }

    const tick = (now: number) => {
      const game = gameRef.current
      const delta = Math.min((now - game.lastFrame) / 1000, 0.04)
      game.lastFrame = now

      if (game.running) {
        game.elapsed += delta
        game.remaining = Math.max(0, DURATION - game.elapsed)
        game.shield = Math.max(0, game.shield - delta)
        game.shieldCooldown = Math.max(0, game.shieldCooldown - delta)
        game.comboTimer = Math.max(0, game.comboTimer - delta)
        if (game.comboTimer === 0) game.combo = 0
        const direction = Number(keysRef.current.right) - Number(keysRef.current.left)
        game.shipX = Math.max(24, Math.min(WIDTH - 24, game.shipX + direction * 390 * delta))
        game.bank += (direction - game.bank) * Math.min(1, delta * 8)

        game.spawnIn -= delta
        if (game.spawnIn <= 0) {
          const meteorChance = Math.min(0.52, 0.24 + game.elapsed * 0.004)
          const roll = Math.random()
          const kind = roll < 0.07 ? 'nova' : roll < 0.07 + meteorChance ? 'meteor' : 'crystal'
          game.drops.push({
            x: Math.random() * 1.8 - 0.9,
            y: 0,
            radius: Math.random() * 2 + 8,
            speed: 0.38 + Math.random() * 0.18 + game.elapsed * 0.0014,
            kind,
            rotation: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 2,
          })
          game.spawnIn = Math.max(0.28, 0.78 - game.elapsed * 0.008) + Math.random() * 0.28
        }

        for (let index = game.drops.length - 1; index >= 0; index -= 1) {
          const drop = game.drops[index]
          drop.y += drop.speed * delta
          drop.rotation += drop.spin * delta
          if (drop.y > 1.08) {
            if (drop.kind !== 'meteor') game.combo = 0
            game.drops.splice(index, 1)
            continue
          }
          const depth = Math.max(0, drop.y)
          const horizon = 150
          const cameraShift = (game.shipX - WIDTH / 2) * 0.16
          const perspective = 0.28 + depth * 1.52
          const projectedX = WIDTH / 2 + drop.x * (22 + depth * 380) - cameraShift
          const projectedY = horizon + depth * (HEIGHT - horizon + 16)
          const collisionRadius = drop.radius * perspective + 18
          if (Math.hypot(projectedX - game.shipX, projectedY - SHIP_Y) < collisionRadius) {
            const collectedCrystal = drop.kind === 'crystal'
            let color = '#80f5ff'
            let label = '+10'
            if (collectedCrystal) {
              game.combo = game.comboTimer > 0 ? game.combo + 1 : 1
              game.comboTimer = 2.4
              const multiplier = getMultiplier(game.combo)
              const points = 10 * multiplier
              game.score += points
              color = '#80f5ff'
              label = `+${points}`
              if (game.combo >= 3 && game.combo % 3 === 0) {
                game.floatingLabels.push({ x: projectedX, y: projectedY - 24, text: `STREAK x${multiplier}`, color: '#b7a5ff', life: 0.8, maxLife: 0.8 })
              }
            } else if (drop.kind === 'nova') {
              game.combo = game.comboTimer > 0 ? game.combo + 1 : 1
              game.comboTimer = 2.4
              game.score += 50
              game.shieldCooldown = 0
              color = '#ffd36e'
              label = '+50 NOVA'
            }             else if (game.shield > 0) {
              game.score += 5
              color = '#a4f5ff'
              label = '+5 SHIELD'
            } else {
              game.lives -= 1
              impactUntil = now + 180
              game.combo = 0
              game.comboTimer = 0
              color = '#ff7185'
              label = 'HULL HIT'
            }
            game.floatingLabels.push({ x: projectedX, y: projectedY - 8, text: label, color, life: 0.75, maxLife: 0.75 })
            for (let particleIndex = 0; particleIndex < 13; particleIndex += 1) {
              const angle = Math.random() * Math.PI * 2
              const speed = 50 + Math.random() * 190
              game.particles.push({
                x: projectedX,
                y: projectedY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.35 + Math.random() * 0.35,
                maxLife: 0.7,
                color,
                size: 1.5 + Math.random() * 2.5,
              })
            }
            game.drops.splice(index, 1)
          }
        }

        for (let index = game.particles.length - 1; index >= 0; index -= 1) {
          const particle = game.particles[index]
          particle.x += particle.vx * delta
          particle.y += particle.vy * delta
          particle.vx *= 0.97
          particle.vy *= 0.97
          particle.life -= delta
          if (particle.life <= 0) game.particles.splice(index, 1)
        }

        for (let index = game.floatingLabels.length - 1; index >= 0; index -= 1) {
          const label = game.floatingLabels[index]
          label.y -= 32 * delta
          label.life -= delta
          if (label.life <= 0) game.floatingLabels.splice(index, 1)
        }

        if (game.remaining <= 0 || game.lives <= 0) finishGame()
        if (now - lastHudUpdate > 100) {
          setHud({ score: game.score, lives: game.lives, remaining: Math.ceil(game.remaining), shield: game.shieldCooldown, shieldActive: game.shield > 0, combo: game.combo, comboTimer: game.comboTimer })
          lastHudUpdate = now
        }
      }

      draw()
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [best, changeStatus])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault()
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keysRef.current.left = true
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keysRef.current.right = true
      if ((event.key.toLowerCase() === 'e' || event.key === 'Shift') && !event.repeat) activateShield()
      if (event.key === 'Escape') togglePause()
      if (event.code === 'Space' && !event.repeat) {
        if (statusRef.current === 'ready' || statusRef.current === 'over') startGame()
        else togglePause()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keysRef.current.left = false
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keysRef.current.right = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activateShield, startGame, togglePause])

  const moveShip = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const previousX = gameRef.current.shipX
    const nextX = Math.max(
      24,
      Math.min(WIDTH - 24, ((event.clientX - bounds.left) / bounds.width) * WIDTH),
    )
    gameRef.current.shipX = nextX
    gameRef.current.bank = Math.max(-1, Math.min(1, (nextX - previousX) / 140))
  }

  const isPlaying = status === 'playing'
  const formattedTime = `00:${String(hud.remaining).padStart(2, '0')}`

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-slate-100 sm:px-8 sm:py-9">
      <div className="pointer-events-none fixed inset-0 grid-glow" />
      <div className="relative mx-auto max-w-[1240px]">
        <motion.header
          className="mb-8 flex items-center justify-between"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <a className="flex items-center gap-3" href="#" aria-label="Starfall home">
            <span className="brand-mark"><Sparkles size={18} /></span>
            <span className="text-sm font-bold tracking-[0.2em] text-white">STARFALL<span className="text-cyan-300">.IO</span></span>
          </a>
          <div className="hidden items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-slate-500 sm:flex">
            <span className="live-dot" /> ARCADE / 001
          </div>
          <button
            className="icon-button"
            onClick={isPlaying ? togglePause : startGame}
            aria-label={isPlaying ? 'Pause game' : status === 'paused' ? 'Resume game' : 'Start a new game'}
            title={isPlaying ? 'Pause (P)' : 'Start or restart'}
          >
            {isPlaying ? <Pause size={17} /> : status === 'paused' ? <Play size={17} /> : <RotateCcw size={17} />}
          </button>
        </motion.header>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="eyebrow mb-2">A 3D ARCADE FLIGHT THROUGH THE COSMOS</p>
            <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Ride the star lane<span className="text-cyan-300">.</span></h1>
          </motion.div>
          <motion.p
            className="max-w-[260px] text-sm leading-6 text-slate-400 sm:text-right"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          >
            Pilot a neon interceptor through a living perspective lane. Bank, dodge, collect—and pulse your shield.
          </motion.p>
        </div>

        <motion.div
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_276px]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
        >
          <section className="game-shell">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-6">
              <div className="flex items-center gap-5 sm:gap-8">
                <div>
                  <p className="stat-label">SCORE</p>
                  <p className="stat-value">{String(hud.score).padStart(4, '0')}</p>
                </div>
                <div className="h-9 w-px bg-white/[0.08]" />
                <div>
                  <p className="stat-label">TIME LEFT</p>
                  <p className={`stat-value ${hud.remaining <= 10 ? 'text-rose-300' : ''}`}>{formattedTime}</p>
                </div>
                <div className="hidden h-9 w-px bg-white/[0.08] sm:block" />
                <div className="hidden min-w-[126px] sm:block">
                  <p className="stat-label">ENERGY SHIELD</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="shield-meter">
                      <span style={{ width: `${hud.shieldActive ? 100 : Math.max(0, ((7 - hud.shield) / 7) * 100)}%` }} />
                    </div>
                    <span className={`text-[9px] font-bold tracking-[0.12em] ${hud.shieldActive ? 'text-cyan-200' : 'text-slate-500'}`}>
                      {hud.shieldActive ? 'ON' : hud.shield <= 0 ? 'READY' : `${hud.shield.toFixed(1)}s`}
                    </span>
                  </div>
                </div>
                {hud.combo > 0 && (
                  <motion.div
                    key="combo"
                    className="combo-chip"
                    initial={{ opacity: 0, scale: 0.86, y: 5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                  >
                    <p className="stat-label text-violet-200/75">STREAK</p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-violet-100">
                      {hud.combo}<span className="ml-1 text-[9px] font-semibold tracking-wider text-violet-200/60">CHAIN</span>
                    </p>
                    <div className="combo-meter">
                      <span style={{ width: `${Math.min(100, (hud.comboTimer / 2.4) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[8px] font-bold tracking-[0.12em] text-violet-200/60">
                      x{getMultiplier(hud.combo)} MULTIPLIER
                    </p>
                  </motion.div>
                )}
              </div>
              <div className="flex items-center gap-1.5" aria-label={`${hud.lives} lives remaining`}>
                {[0, 1, 2].map((life) => (
                  <Heart
                    key={life}
                    size={17}
                    className={life < hud.lives ? 'fill-rose-400 text-rose-400' : 'text-slate-700'}
                    strokeWidth={1.8}
                  />
                ))}
              </div>
            </div>

            <div className="game-stage">
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                onPointerMove={moveShip}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  moveShip(event)
                }}
                aria-label="Starfall 3D flight lane. Steer with the arrow keys or pointer and activate the shield with E."
              />
              {status !== 'playing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#080d18]/55 px-5 backdrop-blur-[2px]">
                  <motion.div
                    key={status}
                    className="max-w-sm text-center"
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                      {status === 'paused' ? <Pause size={19} /> : status === 'over' ? <Sparkles size={20} /> : <Crosshair size={20} />}
                    </div>
                    <p className="eyebrow mb-2">{status === 'over' ? 'RUN COMPLETE' : status === 'paused' ? 'TAKE A BREATH' : 'READY WHEN YOU ARE'}</p>
                    <h2 className="mb-2 text-2xl font-semibold tracking-tight text-white">
                      {status === 'over' ? (hud.lives > 0 ? 'You made it to sunrise.' : 'The field got you.') : status === 'paused' ? 'Game paused' : 'The stars are yours.'}
                    </h2>
                    <p className="mx-auto mb-5 max-w-[290px] text-sm leading-6 text-slate-300/75">
                      {status === 'over'
                        ? `You collected ${hud.score} points of starlight. ${hud.score > 0 ? 'One more run?' : 'Every pilot starts somewhere.'}`
                        : status === 'paused'
                          ? 'Your ship is safe. Jump back in when you’re ready.'
                          : 'Move your ship, gather the glowing crystals, and stay clear of the meteors.'}
                    </p>
                    <button className="primary-button mx-auto" onClick={status === 'paused' ? togglePause : startGame}>
                      {status === 'paused' ? <Play size={15} fill="currentColor" /> : status === 'over' ? <RotateCcw size={15} /> : <Play size={15} fill="currentColor" />}
                      {status === 'paused' ? 'RESUME FLIGHT' : status === 'over' ? 'PLAY AGAIN' : 'START YOUR RUN'}
                    </button>
                    {status === 'ready' && <p className="mt-4 text-[10px] tracking-[0.12em] text-slate-500">OR PRESS SPACE</p>}
                  </motion.div>
                </div>
              )}
              <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-white/30">
                <span className="live-dot" /> LIVE FLIGHT SIMULATION
              </div>
              {isPlaying && (
                <button
                  className={`shield-button absolute bottom-3 right-4 ${hud.shieldActive ? 'is-active' : ''}`}
                  onClick={activateShield}
                  disabled={hud.shield > 0 && !hud.shieldActive}
                  aria-label={hud.shieldActive ? 'Shield active' : hud.shield <= 0 ? 'Activate shield' : `Shield recharging for ${hud.shield.toFixed(1)} seconds`}
                >
                  <Shield size={13} />
                  {hud.shieldActive ? 'SHIELD ON' : hud.shield <= 0 ? 'SHIELD · E' : `RECHARGING ${hud.shield.toFixed(1)}s`}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="keycap">←</span><span className="keycap">→</span>
                <span className="ml-1">or A / D to steer</span>
              </div>
              <button
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"
                onClick={isPlaying ? togglePause : status === 'paused' ? togglePause : startGame}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                {isPlaying ? 'Pause flight' : status === 'paused' ? 'Resume flight' : status === 'over' ? 'Fly again' : 'Start flight'}
                <span className="text-slate-600">· SPACE</span>
              </button>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="side-card">
              <div className="mb-5 flex items-center justify-between">
                <p className="eyebrow">MISSION BRIEF</p>
                <span className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.07] px-2 py-1 text-[9px] font-bold tracking-[0.14em] text-cyan-200">ACTIVE</span>
              </div>
              <h2 className="mb-2 text-lg font-semibold tracking-tight text-white">Starlight run</h2>
              <p className="mb-5 text-xs leading-5 text-slate-400">Dive through the perspective lane, chain crystals for up to 3× points, and hunt rare Novas to refill your shield.</p>
              <div className="space-y-3 border-t border-white/[0.07] pt-4">
                <div className="flex items-center gap-3">
                  <span className="legend-icon crystal"><Sparkles size={13} /></span>
                  <div className="flex-1 text-xs text-slate-300">Starlight crystal</div>
                  <span className="text-xs font-semibold text-cyan-200">+10</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="legend-icon meteor"><Zap size={13} /></span>
                  <div className="flex-1 text-xs text-slate-300">Falling meteor</div>
                  <span className="text-xs font-semibold text-rose-300">−1 life</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="legend-icon nova"><Sparkles size={13} /></span>
                  <div className="flex-1 text-xs text-slate-300">Nova star · rare</div>
                  <span className="text-xs font-semibold text-amber-200">+50 + shield</span>
                </div>
              </div>
            </section>

            <section className="side-card">
              <div className="mb-4 flex items-center justify-between">
                <p className="eyebrow">FLIGHT CONTROLS</p>
                <Crosshair size={15} className="text-slate-500" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <ArrowLeft size={14} /><ArrowRight size={14} />
                  <span className="ml-1">STEER</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="keycap">A</span><span className="keycap">D</span>
                  <span className="mx-1 text-slate-600">or</span>
                  <span className="keycap"><ArrowLeft size={11} /></span>
                  <span className="keycap"><ArrowRight size={11} /></span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><ArrowUp size={13} /><ArrowDown size={13} /> POINTER</div>
                <span className="text-[10px] text-slate-500">Drag to move</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-400"><Pause size={12} /> PAUSE</div>
                <span className="keycap px-2">SPACE</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2 text-[10px] text-cyan-200"><Shield size={12} /> PULSE SHIELD</div>
                <span className="keycap">E</span>
              </div>
            </section>

            <section className="best-card">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Sparkles size={16} /></div>
                <div>
                  <p className="eyebrow mb-1">PERSONAL BEST</p>
                  <p className="text-xl font-semibold tracking-tight text-white">{String(best).padStart(4, '0')} <span className="text-xs font-medium text-slate-500">PTS</span></p>
                </div>
                <Timer size={15} className="ml-auto self-start text-slate-600" />
              </div>
            </section>
          </aside>
        </motion.div>

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium tracking-[0.12em] text-slate-600">
          <span>MADE FOR THE IN-BETWEEN MOMENTS</span>
          <span className="flex items-center gap-2"><Zap size={11} className="text-cyan-400" /> GOOD LUCK OUT THERE, PILOT</span>
        </footer>
      </div>
    </main>
  )
}

export default App
