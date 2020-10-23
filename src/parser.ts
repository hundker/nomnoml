namespace nomnoml {
	interface ParsedDiagram {
		root: Compartment
		config: Config
	}
	export type AstRoot = AstCompartment
	interface AstClassifier {
		type: string,
		name: string,
		parts: AstCompartment[]
	}
	interface AstCompartment {
		lines: string[]
		nodes: AstClassifier[]
		rels: AstRelation[]
	}
	interface AstRelation {
		assoc: string,
		start: string,
		end: string,
		startLabel: string,
		endLabel: string
	}

	declare var nomnomlCoreParser: { parse(source: string): AstRoot }

	class Line {
			index: number
			text: string
	}

	export function parse(source: string): ParsedDiagram {
		function onlyCompilables(line: string){
			var ok = line[0] !== '#' && line.trim().substring(0,2) !== '//'
			return ok ? line.trim() : ''
		}
		function isDirective(line: Line): boolean { return line.text[0] === '#' }
		var lines: Line[] = source.split('\n').map(function (s, i){
			return {text: s, index: i }
		})
		var pureDirectives = lines.filter(isDirective)
		var directives: { [key: string]: string } = {}
		pureDirectives.forEach(function (line){
			try {
				var tokens =  line.text.substring(1).split(':')
				directives[tokens[0].trim()] = tokens[1].trim()
			}
			catch (e) {
				throw new Error('line ' + (line.index + 1) + ': Malformed directive')
			}
		})
		var pureDiagramCode = lines.map(e => onlyCompilables(e.text)).join('\n')
		
		if (pureDiagramCode == '') {
			return {
				root: new Compartment([], [], []),
				config: getConfig(directives)
			}
		}
		
		var parseTree = nomnoml.intermediateParse(pureDiagramCode)
		return {
			root: nomnoml.transformParseIntoSyntaxTree(parseTree),
			config: getConfig(directives)
		}

		function directionToDagre(word: any): 'TB'|'LR' {
			if (word == 'down') return 'TB'
			if (word == 'right') return 'LR'
			else return 'TB'
		}

		function parseRanker(word: string | undefined): dagre.Ranker {
			if (word == 'network-simplex' || word == 'tight-tree' || word == 'longest-path') {
				return word
			}
			return 'network-simplex'
		}

		function parseCustomStyle(styleDef: string): Style {
			var contains = skanaar.hasSubstring
			return {
				bold: contains(styleDef, 'bold'),
				underline: contains(styleDef, 'underline'),
				italic: contains(styleDef, 'italic'),
				dashed: contains(styleDef, 'dashed'),
				empty: contains(styleDef, 'empty'),
				center: skanaar.last(styleDef.match('align=([^ ]*)') || []) == 'left' ? false : true,
				fill: skanaar.last(styleDef.match('fill=([^ ]*)') || []),
				stroke: skanaar.last(styleDef.match('stroke=([^ ]*)') || []),
				visual: (skanaar.last(styleDef.match('visual=([^ ]*)') || []) || 'class') as Visual,
				direction: directionToDagre(skanaar.last(styleDef.match('direction=([^ ]*)') || [])),
			}
		}

		function getConfig(d: { [index:string]:string }): Config {
			var userStyles: { [index:string]: Style } = {}
			for (var key in d) {
				if (key[0] != '.') continue
				var styleDef = d[key]
				userStyles[key.substring(1).toUpperCase()] = parseCustomStyle(styleDef)
			}
			return {
				arrowSize: +d.arrowSize || 1,
				bendSize: +d.bendSize || 0.3,
				direction: directionToDagre(d.direction),
				gutter: +d.gutter || 5,
				edgeMargin: (+d.edgeMargin) || 0,
				gravity: +(d.gravity ?? 1),
				edges: d.edges == 'hard' ? 'hard' : 'rounded',
				fill: (d.fill || '#eee8d5;#fdf6e3;#eee8d5;#fdf6e3').split(';'),
				background: d.background || 'transparent',
				fillArrows: d.fillArrows === 'true',
				font: d.font || 'Helvetica',
				fontSize: (+d.fontSize) || 12,
				leading: (+d.leading) || 1.25,
				lineWidth: (+d.lineWidth) || 3,
				padding: (+d.padding) || 8,
				spacing: (+d.spacing) || 40,
				stroke: d.stroke || '#33322E',
				title: d.title || '',
				zoom: +d.zoom || 1,
				acyclicer: d.acyclicer === 'greedy' ? 'greedy' : undefined,
				ranker: parseRanker(d.ranker),
				styles: skanaar.merged(nomnoml.styles, userStyles)
			};
		}
	}

	export function intermediateParse(source: string): AstRoot {
		return nomnomlCoreParser.parse(source)
	}

	export function transformParseIntoSyntaxTree(entity: AstRoot): Compartment {
		var relationId: number = 0

		function transformCompartment(slots: AstCompartment): Compartment {
			var lines: string[] = slots.lines
			var rawClassifiers: AstClassifier[] = slots.nodes
			var relations: Relation[] = []
			slots.rels.forEach(function (p: AstRelation){
				relations.push({
					id: relationId++,
					assoc: p.assoc,
					start: p.start,
					end: p.end,
					startLabel: { text: p.startLabel },
					endLabel: { text: p.endLabel }
				})
			})
			var allClassifiers: Classifier[] = rawClassifiers
				.map(transformClassifier)
				.sort(function(a: Classifier, b: Classifier): number {
					return b.compartments.length - a.compartments.length
				})
			var uniqClassifiers = skanaar.uniqueBy(allClassifiers, 'name')
			var uniqRelations = relations.filter(function (a){
				for (var b of relations) {
					if (a === b) return true
					if (b.start == a.start && b.end == a.end) return false
				}
				return true
			})
			return new Compartment(lines, uniqClassifiers, uniqRelations)
		}

		function transformClassifier(entity: AstClassifier): Classifier {
				var compartments = entity.parts.map(transformCompartment)
				return new Classifier(entity.type, entity.name, compartments)
		}

		return transformCompartment(entity)
	}
}
