"""The names, categories and first-guess footprints of the owner's generated prop sheets (the owner, 2026-11-02: "make sure all the images in this
folder are added as sprites to the game and library and used in the game even if it's just props you can place for now"). Each sheet is a 2x2
of four items: top left, top right, bottom left, bottom right. hx: half the footprint in metres, a first guess (resize in the studio).
usage: python make-manifest.py   (writes manifest.json beside it)"""
import json, os

SRC = 'E:/Repos/CapitalEmpire/All Generated Images'
T, CP, ST, SS, EV, ES, VE, PE, RA, SE, BU, LA, ME = ('Trees', 'Course props', 'Stalls', 'Stalls (shabby)', 'Event structures', 'Event structures (shabby)',
                                                     'Vehicles', 'People', 'Range', 'Seating', 'Buildings', 'Lake props', 'Media')
S = [
    (ST, 2, ['Green food kiosk', 'Drinks stand with canopy', 'Food pavilion', 'Ice cream cart']),
    (T, 1.5, ['Dark fir tall', 'Dark fir wide', 'Dark fir medium', 'Dark fir small']),
    (T, 1.5, ['Red maple', 'Red maple bare', 'Red maple sparse', 'Red maple full']),
    (BU, 5, ['Neon storefront row', 'Neon diner front', 'Brick storefront', 'Lit shop corner']),
    (CP, 0.6, ['Leaderboard', 'Hole 12 sign', 'Clock post', 'Direction signpost']),
    (CP, 0.4, ['Ball washer', 'Gold tee markers', 'Yardage posts', 'Sprinkler']),
    (SS, 2, ['Tarp market stall', 'Shack stall', 'Cooler drinks stall', 'Course worker']),
    (EV, 2, ['Medical tent', 'Cart ambulance', 'First aid trailer', 'Weather station']),
    (T, 1.5, ['Blue spruce wide', 'Blue spruce tall', 'Blue spruce medium', 'Blue spruce small']),
    (T, 1.2, ['Thin blue fir', 'Thin blue fir tall', 'Thin blue fir sparse', 'Thin blue fir small']),
    (T, 1.5, ['Red maple round', 'Red maple big', 'Red maple tall', 'Red maple small']),
    (VE, 1.2, ['Ride mower', 'Gang mower', 'Spray rig', 'Greens mower']),
    (VE, 3, ['Shuttle bus', 'Shuttle bus 2', 'Taxi', 'Taxi 2']),
    (PE, 0.3, ['Golfer swinging', 'Golfer putting', 'Caddie with bag', 'Marshal with sign']),
    (PE, 0.3, ['Golfer swinging 2', 'Golfer putting 2', 'Caddie with bag 2', 'Marshal with sign 2']),
    (EV, 3, ['Starter hut', 'Clubhouse cottage', 'Marquee', 'Stage']),
    (CP, 1, ['Wooden footbridge', 'Park bench', 'Course map stand', 'Ride mower 2']),
    (EV, 2, ['Course map board', 'Pro shop kiosk', 'Portable toilets', 'Wash station']),
    (T, 1.5, ['Orange oak', 'Orange oak wide', 'Orange oak full', 'Orange oak small']),
    (SS, 2, ['Shack map board', 'Tool stall', 'Toilet booth', 'Water tank stall']),
    (SE, 1.5, ['Tarp seating', 'Umbrella tables', 'Round table set', 'Picnic table']),
    (T, 1.5, ['Orange maple', 'Orange maple wide', 'Orange maple bare', 'Orange maple full']),
    (CP, 1, ['Golf cart', 'Golf cart 2', 'Flag pin', 'Golf bag trolley']),
    (SS, 2, ['Shirt stall', 'Cap stall', 'Tarp counter', 'Club badge stall']),
    (CP, 0.8, ['Rope barrier', 'Rope barrier corner', 'Rope walkway', 'Marshal']),
    (SS, 2.5, ['Shanty hut', 'Gate arch', 'Shanty stall', 'Shanty counter']),
    (T, 1, ['Small orange tree', 'Small orange tree 2', 'Small orange tree bare', 'Small orange tree full']),
    (RA, 2.5, ['Shanty range bay', 'Practice net', 'Equipment stall', 'Ball bucket stand']),
    (VE, 1.3, ['Roofed cart', 'Utility cart', 'Supply cart', 'Wheelchair cart']),
    (ST, 2, ['Garden shed', 'Club rack stall', 'Club display', 'Bag stand stall']),
    (BU, 6, ['Clubhouse manor', 'Gate pillars', 'Pavilion', 'Gazebo']),
    (RA, 2.5, ['Range bay', 'Practice cage', 'Tent bay', 'Ball dispenser']),
    (SS, 1.8, ['Snack shack', 'Drinks cart', 'Snack stall', 'Snack trolley']),
    (EV, 5, ['Grandstand small', 'Covered grandstand', 'Grandstand wide', 'TV tower']),
    (T, 1.5, ['Bare oak', 'Bare oak wide', 'Bare oak tall', 'Bare oak small']),
    (ME, 2.5, ['Camera tower', 'Broadcast truck', 'Satellite van', 'TV camera']),
    (VE, 2.5, ['Delivery truck', 'Forklift with pallets', 'Water truck', 'Utility cart green']),
    (CP, 1.5, ['Stone bridge', 'White footbridge', 'Flower bed', 'Flowering tree']),
    (ES, 2.5, ['Wooden bleacher', 'Small bleacher', 'Bleacher platform', 'Bleacher tower']),
    (SS, 2, ['Shanty shed', 'Flag stall', 'Tarp shelter', 'Market tents']),
    (ES, 2, ['Shanty medical tent', 'Shanty cart ambulance', 'Shanty toilet', 'Shanty weather mast']),
    (T, 1, ['Small red maple', 'Small red maple 2', 'Small red maple 3', 'Small red maple 4']),
    (CP, 1.5, ['Log footbridge', 'Plank bridge', 'Flower planter', 'Small tree']),
    (ME, 2.5, ['Shanty camera tower', 'Shanty broadcast van', 'Shanty satellite van', 'Shanty camera']),
    (SE, 2.5, ['Hospitality marquee', 'Umbrella table green', 'Dining pavilion', 'Long picnic table']),
    (EV, 2, ['Ticket booth', 'White tent booth', 'Green booth', 'Green kiosk']),
    (ES, 2.5, ['Scaffold stand', 'Scaffold booth', 'Scaffold counter', 'Scaffold tower']),
    (ES, 3.5, ['Wooden bleacher big', 'Covered bleacher', 'Bleacher deck', 'Bleacher stairs']),
    (VE, 1.4, ['Green golf cart', 'Shuttle cart', 'Drinks cart green', 'Shuttle cart white']),
    (T, 1.5, ['Orange tree', 'Orange tree wide', 'Orange tree sparse', 'Orange tree full']),
    (ES, 2, ['Shanty ticket hut', 'Shanty booth', 'Shanty turnstiles', 'Shanty counter 2']),
    (VE, 1.2, ['Green ride mower', 'Green gang mower', 'Green spray rig', 'Green greens mower']),
    (LA, 1.5, ['Wooden dock', 'Wooden dock 2', 'Rowboat', 'Bait shack']),
    (EV, 2.5, ['Catering tent', 'Catering trailer', 'Buffet tent', 'Catering staff']),
    (EV, 2.5, ['Hospitality tent', 'Trophy pavilion', 'Club tent', 'Club arch sign']),
    (T, 1.5, ['Orange tree round', 'Orange tree big', 'Orange tree tall', 'Orange tree small']),
    (T, 1.2, ['Birch', 'Birch wide', 'Birch bare', 'Birch full']),
    (T, 0.9, ['Small birch', 'Small birch 2', 'Small birch 3', 'Small birch 4']),
    (CP, 0.6, ['Shanty leaderboard', 'Shanty hole sign', 'Shanty clock', 'Shanty signpost']),
]
files = sorted(f for f in os.listdir(SRC) if f.endswith('.png'))
assert len(S) == len(files) == 59, (len(S), len(files))
sheets = [{'sheet': f, 'cat': c, 'hx': hx, 'names': n} for f, (c, hx, n) in zip(files, S)]
json.dump({'source': SRC, 'cells': 'top left, top right, bottom left, bottom right', 'sheets': sheets},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest.json'), 'w', encoding='utf-8'), indent=1)
print(len(sheets), 'sheets', sum(len(s['names']) for s in sheets), 'items')
