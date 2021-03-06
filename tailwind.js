/**
 * Provides ability to check code coverage as a script runs
 *
 * @module Tailwind
 */
window.Tailwind = (function(){
    /**
     * Contains information about a watched statement and gives the ability to track executions
     * <br/><em>[this class cannot be created directly]</em>
     *
     * @class Codeblock
     * @param statement {Object} The esprima-generated object describing this statement
     * @param [sourceCode] {String} Full script that this statement is from, used to track exactly what code this statement points to
     * @constructor
     * @private
     */
    var codeblocks = [],
        Codeblock = (function(){
            var id = 0;
            return function( statement, sourceCode, expression )
            {
                this.id = id++;
                this.statement = statement;
                this.rangeStart = statement.range[0];
                this.rangeEnd = statement.range[1];
                this.type = statement.type;
                this.expression = expression || false;
                this.code = null;
                this.executionCount = 0;

                if ( typeof sourceCode === 'string' )
                {
                    this.code = sourceCode.substring( this.rangeStart, this.rangeEnd );
                }

                codeblocks.push( this );
            };
        })();
    Codeblock.prototype = {
        /**
         * Internal ID for this Codeblock
         * @property id {Number}
         */
        id: null,

        /**
         * The Esprima-generated object this Codeblock is created for
         * @property statement {Object}
         */
        statement: null,

        /**
         * Character index this Codeblock is found in the source code
         * @property rangeStart {Number}
         */
        rangeStart: null,

        /**
         * Character index this Codeblock ends at in the source code
         * @property rangeEnd {Number}
         */
        rangeEnd: null,

        /**
         * Type of statement this Codeblock represents, as generated from Esprima
         * @property type {String}
         */
        type: null,

        /**
         * The source code represented by this Codeblock
         * @property code {String}
         */
        code: null,

        /**
         * How many times this Codeblock's statement was executed
         * @property executionCount {Number}
         * @default 0
         */
        executionCount: null,

        /**
         * Increments the Codeblock's <em>executionCount</em> property
         *
         * @method countExecution
         */
        countExecution: function()
        {
            this.executionCount++;
        }
    };

    /**
     * Checks for esprima to be available, throws an error if it isn't.
     * @method checkForEsprima
     * @private
     */
    var checkForEsprima = function()
        {
            if ( window.esprima === undefined )
            {
                throw new Error( 'Esprima must be included on the page <http://esprima.org/>' );
            }
        },

        checkForEscodegen = function()
        {
            if ( window.escodegen === undefined )
            {
                throw new Error( 'Escodegen must be included on the page <https://github.com/Constellation/escodegen/>' );
            }
        },

        /**
         * Returns an object to use for an ajax request
         * @method getAjaxObject
         * @param callback {Function} Callback function for the request to trigger after successful request
         * @param errorCallback {Function} Callback function which will fire if the request fails
         * @private
         */
            getAjaxObject = function( callback, errorCallback )
        {
            var request;

            if ( typeof XMLHttpRequest !== 'undefined' )
            {
                request = new XMLHttpRequest();
                request.type = 'w3c';
                request.onreadystatechange = handleReadyStateChange;
            }
            else if ( typeof XDomainRequest !== 'undefined' )
            {
                request = new XDomainRequest();
                request.type = 'xdr';
                request.onload = handleReadyStateChange;
            }

            request.callback = callback;
            if ( typeof errorCallback === 'function' )
            {
                request.onerror = errorCallback;
            }

            return request;
        },

        /**
         * Function used by the ajax requests to watch their state
         * @method handleReadyStateChange
         * @private
         */
            handleReadyStateChange = function()
        {
            if ( this.readyState === 4 )
            {
                var hasErrorCallback = typeof this.onerror === 'function';

                if ( this.status >= 400 )
                {
                    if ( hasErrorCallback )
                    {
                        this.onerror();
                    }
                }
                else
                {
                    try
                    {
                        this.callback( this.responseText );
                    }
                    catch ( e )
                    {
                        if ( hasErrorCallback )
                        {
                            this.onerror();
                        }
                        else
                        {
                            throw e;
                        }
                    }
                }
            }
        };

    /**
     * Provides coverage statistics against some code
     * <br/><em>[this class cannot be created directly]</em>
     *
     * @class TailwindStats
     * @constructor
     */
    var TailwindStats = function( sourceCode )
    {
        this.sourceCode = sourceCode;
        this.codeblocks = [];
    };
    TailwindStats.prototype = {
        /**
         * Returns an overview of how many watched statements have been run.
         *
         * @method getReport
         * @return {Object} Dictionary object detailing total statements are watched and how many were run at least once
         */
        getReport: function()
        {
            var report = {
                statements: this.codeblocks.length,
                executed: 0
            };

            for ( var i = 0; i < this.codeblocks.length; i++ )
            {
                if ( this.codeblocks[i].executionCount > 0 )
                {
                    report.executed++;
                }
            }

            return report;
        }
    };

    function traverse( object, visitor, code ) {
        var key, child;

        for ( key in object ) {
            // Don't check the init part of ForStatements, often contain VariableDeclaration which we can't monitor
            if ( object.type === 'ForStatement' && key === 'init' )
            {
                continue;
            }

            // Don't check the left part of ForInStatements, often contain VariableDeclaration which we can't monitor
            if ( object.type === 'ForInStatement' && key === 'left' )
            {
                continue;
            }

            if ( object.hasOwnProperty( key ) ) {
                child = object[key];
                if ( typeof child === 'object' && child !== null ) {
                    var result = traverse( child, visitor );

                    if ( object[key].type === 'ConditionalExpression' )
                    {
                        var codeblock = new Codeblock( object[key].consequent, code );
                        object[key].consequent = getMonitorStatement( codeblock, object[key].consequent );

                        codeblock = new Codeblock( object[key].alternate, code );
                        object[key].alternate = getMonitorStatement( codeblock, object[key].alternate );
                    }

                    if ( result ) {
                        if ( object[key].body instanceof Array )
                        {
                            object[key].body.unshift( result );
                        }
                        else
                        {
                            //object[key] = { type: 'Program', body: [ result, object[key] ]  }
                            object[key] = { type: 'BlockStatement', body: [ result, object[key] ]  }
                            //object[key] = { 'type': 'ExpressionStatement', 'expression': object[key] }
                        }
                    }
                }
            }
        }

        return visitor.call( null, object, code );
    }

    function getMonitorStatement( codeblock, retval )
    {
        if ( retval == null )
        {
            return {"type": "ExpressionStatement", "expression": {"type": "CallExpression", "callee": {"type": "MemberExpression", "computed": false, "object": {"type": "Identifier", "name": "Tailwind"}, "property": {"type": "Identifier", "name": "executeBlock"}}, "arguments":
                [
                    {"type": "Literal", "value": codeblock.id, "raw": codeblock.id.toString()}
                ]}};
        }
        else
        {
            return {"type": "CallExpression", "callee": {"type": "MemberExpression", "computed": false, "object": {"type": "Identifier", "name": "Tailwind"}, "property": {"type": "Identifier", "name": "executeBlock"}}, "arguments":
                [
                    {"type": "Literal", "value": codeblock.id, "raw": codeblock.id.toString()},
                    retval
                ]};
        }
    }

    /**
     * @class Tailwind
     * @static
     */
    var Tailwind = {
        /**
         * Takes Javascript code and runs it while monitoring what statements are executed
         * @method runCode
         * @param code {String} The code to run
         * @return {TailwindStats} Object containing information for reporting on coverage
         */
        runCode: function( code )
        {
            checkForEsprima();
            checkForEscodegen();
            var stats = new TailwindStats( code );

            // 1. Use Esprima to parse the script
            var syntaxTree = esprima.parse( code, { range: true } );

            // 2. Locate branches and what we care about
            var careAbout = [
                'VariableDeclaration',
                'ExpressionStatement',
                'BlockStatement',
                'ThrowStatement',
                'FunctionDeclaration',
                'ReturnStatement',
                'BreakStatement'
            ];

            traverse(
                syntaxTree,
                function( node )
                {
                    if ( node.type === undefined || node.range === undefined )
                    {
                        return;
                    }

                    if ( careAbout.indexOf( node.type ) !== -1 )
                    {
                        var codeblock = new Codeblock( node, code );
                        return getMonitorStatement( codeblock );
                    }
                },
                code
            );

            Array.prototype.push.apply( stats.codeblocks, codeblocks );

            // 3. Safely execute the modified code
            var modifiedCode = escodegen.generate( syntaxTree );
            window.code = modifiedCode;
            window.eval.call( undefined, modifiedCode );

            return stats;
        },

        /**
         * Imports and executes a Javascript file while monitoring what statements are executed
         * @method runScript
         * @param scriptUrl {String} URL to the Javascript file to be monitored
         * @param callback {Function} Function which will be called after the script is imported
         * @param callback.stats {TailwindStats} Object containing information for reporting on coverage
         */
        runScript: function( scriptUrl, callback )
        {
            var request = getAjaxObject(
                function( code )
                {
                    var stats = Tailwind.runCode( code );
                    callback( stats );
                }
            );

            request.open( 'GET', scriptUrl, false );
            request.send();
        },

        /**
         * Records that a specific code block was executed
         * @method executeBlock
         * @param blockId {Number}
         * @private
         */
        executeBlock: function( blockId )
        {
            codeblocks[blockId].countExecution();
            return arguments[1];
        },

        /**
         * Contains functions which generate a report from a TailwindStats object
         * @class Reporters
         * @namespace Tailwind
         * @static
         */
        Reporters: {
            /**
             * @method html
             * @param stats {TailwindStats} The stats object to generate a report for.
             * @return {String} HTML code for the report
             */
            html: function( stats )
            {
                function padLeft( src, character, length )
                {
                    var out = src;
                    for ( var i = length - src.length; i > 0; i-- )
                    {
                        out = character + out;
                    }
                    return out;
                }

                function addCoverageLocation( where, what )
                {
                    if ( coverageLocations[where] === undefined )
                    {
                        coverageLocations[where] = [];
                    }
                    coverageLocations[where].push( what );
                }

                var coverageLocations = [],
                    i, block;

                // Queue marker locations
                for ( i = 0; i < stats.codeblocks.length; i++ )
                {
                    block = stats.codeblocks[i];
                    if ( block.executionCount > 0 )
                    {
                        addCoverageLocation( block.rangeStart, { type: 'hitStart' } );
                        addCoverageLocation( block.rangeEnd, { type: 'hitEnd' } );
                    }
                    else
                    {
                        addCoverageLocation( block.rangeStart, { type: 'missStart' } );
                        addCoverageLocation( block.rangeEnd, { type: 'missEnd' } );
                    }
                }

                // Apply markers
                var offset = 0,
                    code = stats.sourceCode;
                for ( i = 0; i < coverageLocations.length; i++ )
                {
                    var coverageLocation = coverageLocations[i];
                    if ( coverageLocation === undefined )
                    {
                        continue;
                    }

                    for ( var j = 0; j < coverageLocation.length; j++ )
                    {
                        var coverage = coverageLocation[j];

                        var position = i,
                            type = coverage.type,
                            injection;

                        if ( type === 'hitStart' )
                        {
                            injection = '<span class="tailwind-covered">';
                        }
                        else if ( type === 'missStart' )
                        {
                            injection = '<span class="tailwind-missed">';
                        }
                        else if ( type === 'hitEnd' || type === 'missEnd' )
                        {
                            injection = '</span>';
                        }

                        code = code.substring( 0, position + offset ) + injection + code.substring( position + offset );
                        offset += injection.length;
                    }
                }

                // Insert line numbers
                code = code.split( /[\r\n]+/ );
                var linenoStart = '<span class="tailwind-lineno">',
                    linenoEnd = '</span>',
                    lineCount = code.length,
                    lineCountLength = lineCount.toString().length,
                    currentLine = 1;

                code = code.reduce(
                    function( a, b )
                    {
                        var a_lineno = '',
                            b_lineno = '',
                            lineno;

                        if ( a.indexOf( linenoStart ) !== 0 )
                        {
                            lineno = padLeft( currentLine.toString( 10 ), '&nbsp;', lineCountLength );
                            a_lineno = linenoStart + lineno + linenoEnd;
                            currentLine++;
                        }

                        lineno = padLeft( currentLine.toString( 10 ), '&nbsp;', lineCountLength );
                        b_lineno = linenoStart + lineno + linenoEnd;
                        currentLine++;

                        return a_lineno + a + '\n' + b_lineno + b;
                    }
                );

                return code;
            }
        }
    };


    return Tailwind;
})();