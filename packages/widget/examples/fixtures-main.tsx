import { render } from 'preact'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../src/panel/tokens.css'
import '../src/panel/panel.css'
import { FixturesApp } from './fixtures-app'

const root = document.getElementById('fixtures-root')
if (root) render(<FixturesApp />, root)
