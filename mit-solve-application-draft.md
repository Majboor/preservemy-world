# MIT Solve Application Draft: preservemy.world

Challenge: 10th Anniversary Global Challenge

Prize fit:
- AI for Humanity Prize
- E Ink Innovation Prize, especially intercultural understanding and education

## Solution Name

preservemy.world

## One-Line Solution

preservemy.world turns simple phone footage into explorable 3D memories so communities can preserve culture, heritage, religious spaces, and personal places before they disappear.

## Problem

The world is changing faster than we can document it. Cultural spaces, religious places, old streets, villages, homes, schools, markets, and family memories can disappear through modernization, neglect, conflict, disaster, or displacement. Most people already record videos, but long videos often sit unseen in phones and drives. They do not let future generations feel what it was like to be inside a place.

Heritage preservation is often controlled by institutions with expensive tools. Communities, students, families, travelers, and local volunteers need a simpler way to preserve the places that shaped them.

## Solution

preservemy.world is a youth-built AI platform for turning simple video footage into explorable 3D worlds. A user records or uploads footage of a meaningful place. The backend concept processes the video through frame extraction, spatial reconstruction, and Gaussian Splat training, then returns a 3D output that can be explored, shared, or downloaded.

The current prototype shows one sample 3D scene because compute is limited, but it proves the interaction model: record a place, upload it, and preserve it as a world.

## Who It Serves

- Communities preserving cultural and religious spaces
- Students and schools learning through interactive heritage
- Families preserving homes, schools, travel memories, and personal places
- NGOs, museums, and local historians documenting vulnerable spaces
- People affected by displacement, conflict, disaster, or rapid urban change

## Impact

The goal is not only to build another 3D capture tool. The goal is a community-led archive of the world’s memories.

Short term:
- Help young people understand culture through interactive 3D places
- Give families and communities a new way to preserve memory
- Show NGOs and schools how simple footage can become a living archive

Long term:
- Build a global public-good preservation map
- Train student ambassadors and local volunteers to capture footage ethically
- Support museums, schools, and heritage organizations with accessible AI preservation tools

## Why Now

Phones are everywhere. AI reconstruction is becoming accessible. At the same time, places are disappearing faster than we can document them. Future generations may not physically visit spaces we take for granted today. They deserve more than screenshots and forgotten videos.

## Technology

The platform uses a video-to-3D pipeline:

1. User uploads footage.
2. System extracts frames.
3. Spatial reconstruction estimates camera positions and geometry.
4. Gaussian Splat training creates a photorealistic 3D scene.
5. User can explore or download the output, such as a `.ply` scene.

The prototype is deployed as a web experience and currently includes one sample scene. The long-term need is scalable cloud infrastructure for community uploads.

## Use of AI

AI is used in two ways:

1. Product technology: video-to-3D spatial reconstruction and Gaussian Splats.
2. Creation workflow: Nano Banana for visual/UI mockups, Veo 3 for generated demo visuals, and AI coding tools to help build the prototype quickly.

## Founder Story

I am Waleed Ajmal, a 15-year-old student developer from Lahore. I am a traveler at heart, and my faith teaches me to explore the wonders of the world and reflect on God’s creation. But school, exams, startup work, and family responsibilities make it hard to travel whenever I want.

I built preservemy.world because I wanted a way to keep meaningful places close and help others preserve the places they care about too. Vibe coding made this possible. I used free and accessible AI/cloud tools to move from emotion to idea to working prototype very fast.

## Differentiation

Most 3D capture tools focus on real estate, gaming, professional scanning, or tech demos. preservemy.world focuses on emotional, cultural, and community-led preservation.

It is not just “convert video to 3D.” It is “preserve what matters before it disappears.”

## Stage

Prototype / pilot stage.

The current web app demonstrates the concept with one sample scene. The next milestone is enabling controlled uploads from a small group of students, travelers, and community volunteers.

## Traction

- Working prototype deployed at https://preservemy.world
- Submission video: https://youtube.com/shorts/G-3JmGYJ3ZA?feature=share
- Won Google AI Seekho local hackathon in Lahore/Pakistan
- PLURAL+ Youth Video Festival submission completed

## Funding / Support Needed

The main need is not only funding. The project needs:

- Cloud credits for video-to-3D processing
- Mentorship around ethical heritage documentation
- NGO, museum, and school pilot partners
- Technical help scaling Gaussian Splat generation
- Guidance on nonprofit structure or fiscal sponsorship
- Introductions to cultural preservation and education networks

## SDG Fit

- SDG 4: Quality Education
- SDG 9: Industry, Innovation and Infrastructure
- SDG 10: Reduced Inequalities
- SDG 11: Sustainable Cities and Communities, especially cultural heritage
- SDG 16: Peace, justice, and inclusive societies through intercultural memory

## 100-Word Summary

preservemy.world is a youth-built AI platform that turns simple phone footage into explorable 3D memories. Communities can preserve mosques, shrines, streets, villages, homes, schools, travel places, and vulnerable heritage before they change or disappear. The system uses video-to-3D spatial reconstruction and Gaussian Splats to create interactive worlds from ordinary footage. The current prototype shows one sample scene, and the next step is scaling community uploads through schools, NGOs, museums, and local volunteers. The mission is to build a community-led archive of culture and memory, not just videos, but living memories.
