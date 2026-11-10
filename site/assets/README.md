# site/assets

Everything in this folder is published as-is at `/assets/<name>`. There is no
manifest to keep in step with it: drop a file in, run the build, and it is on
the site.

## The hero film

The front page plays footage behind the words when it finds it. Add:

| file | what it is | needed? |
|---|---|---|
| `hero.mp4` | the loop, H.264 | yes, Safari wants it |
| `hero.webm` | the same loop, VP9 or AV1 | optional, smaller, used first |
| `hero-poster.jpg` | one still from it | optional but wanted - see below |

Fifteen seconds, no sound, 1920x1080 or 1280x720. Aim under about 3 MB:
it is decoration, and a parent on a phone should never wait for it.

    ffmpeg -i raw.mov -t 15 -an -vf scale=1920:-2 -c:v libx264 -crf 26 \
      -pix_fmt yuv420p -movflags +faststart hero.mp4
    ffmpeg -i hero.mp4 -c:v libvpx-vp9 -crf 36 -b:v 0 -an hero.webm
    ffmpeg -i hero.mp4 -ss 3 -frames:v 1 hero-poster.jpg

Shoot it knowing a navy veil sits over it and the words are on the left, so
keep the left third free of anything you want seen, and avoid hard cuts -
the loop restarts without a fade.

**The poster earns its place.** It is what phones show instead of the film:
the video is never fetched on a narrow screen, on a metered or data-saver
connection, or when the visitor has asked for reduced motion. With no
poster those visitors get the plain navy gradient, which is the original
design and perfectly fine - but a still of the school is better.

Remove every `hero.*` file and the front page goes back to the gradient with
nothing to clean up.

## The hero gallery (temporary)

Photographs in `hero/` show behind the words, in filename order, five seconds
each, until there is footage to replace them. Add `hero.mp4` and the film
takes over automatically - the photographs stay on disk, unused, and come
back if you remove it.

The first one is in the HTML and paints immediately; the rest are fetched
only after the page has finished loading, and not at all on a data-saver or
2G connection, or for a visitor who has asked for reduced motion. Those
visitors see the first photograph, still.

Crop to 16:9 and keep each one under about 120 KB:

    ffmpeg -i photo.jpg -vf "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1600:900"       -quality 58 hero/hero-07.webp

A navy veil sits over them, heaviest on the left where the words are, so
anything you want seen belongs on the right of frame.

**Check what is written on the whiteboard before you add a photograph of a
classroom.** Two of the originals could not be used: one had the wifi names
and passwords on the board, the other had students' first names beside their
marks.

## Page art

`journey.webp` sits behind the "Two tests, four years" band. Wide, flat
artwork compresses enormously as WebP - that one went from 1.4 MB as a PNG
to 27 KB with no visible loss:

    ffmpeg -i art.png -vf scale=1920:-1 -quality 90 art.webp
